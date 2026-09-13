export async function runSuite() {
  const { ID, modeOf, labelFromOTF, describeCheck, ReceiptController, decorate } =
    await import('../scripts/core.js');
  const results = [];
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
  async function test(name, run) {
    try {
      await run();
      results.push({ name, pass: true });
    } catch (e) {
      results.push({ name, pass: false, error: e.message });
    }
  }
  const player = { id: 'p1', name: 'Phil', isGM: false };
  const gm = { id: 'g1', name: 'GM', isGM: true };
  const users = new Map([
    ['p1', player],
    ['p2', { id: 'p2', isGM: false }],
    ['g1', gm],
    ['g2', { id: 'g2', isGM: true }],
  ]);
  const card = (check = '[@actor123@S:"Observation"]', target = 15) =>
    `<div class="roll-message gga-chat-message"><div class="prefix">Roll vs <div class="roll-result">${check}</div> (${target})</div><ul class="modifier-list"><li>-7 SECRET_MODIFIER</li></ul><div class="roll-result"><span class="roll-value">18</span><span class="crit failure">SECRET_CRITICAL_FAILURE</span><span>SECRET_MARGIN_10</span></div></div>`;
  const msg = (overrides = {}) => ({
    id: 'm1',
    author: player,
    speaker: { alias: 'Luke' },
    blind: true,
    whisper: ['g1', 'g2'],
    rolls: [{ total: 18, secret: 'SECRET_DICE' }],
    content: card(),
    flags: {},
    updateSource(update) {
      for (const [path, value] of Object.entries(update)) {
        const parts = path.split('.');
        let obj = this;
        for (const part of parts.slice(0, -1)) obj = obj[part] ??= {};
        obj[parts.at(-1)] = value;
      }
    },
    ...overrides,
  });
  function applyMode(data, mode, viewer) {
    if (mode === 'self') {
      data.whisper = [viewer.id];
      data.blind = false;
    }
    if (mode === 'public') {
      data.whisper = [];
      data.blind = false;
    }
    if (mode === 'gm' || mode === 'blind') {
      if (!data.whisper?.length)
        data.whisper = [...users.values()].filter((u) => u.isGM).map((u) => u.id);
      data.blind = mode === 'blind';
    }
    return data;
  }
  function setup({ viewer = player, config = {}, fail = false } = {}) {
    const created = [],
      notifications = [];
    const settings = { audience: 'self', detail: 'check', ...config };
    let serial = 0;
    const controller = new ReceiptController({
      user: () => viewer,
      users: () => users,
      settings: () => settings,
      randomId: () => `token-${++serial}`,
      create: async (data, options) => {
        if (fail) throw new Error('Database unavailable');
        applyMode(data, options.messageMode, viewer);
        created.push({ data, options });
        return { id: `receipt-${created.length}` };
      },
      notify: (text) => notifications.push(text),
    });
    return { controller, created, notifications, settings };
  }
  async function roll(s, m = msg(), id = 'p1') {
    s.controller.before(m, {}, {}, id);
    await s.controller.after(m, {}, id);
    return m;
  }
  await test('All four standard modes and custom recipients use message data', () => {
    assert(modeOf(msg(), users) === 'blind', 'blind');
    assert(modeOf(msg({ blind: false }), users) === 'gm', 'gm');
    assert(modeOf(msg({ blind: false, whisper: [] }), users) === 'public', 'public');
    assert(
      modeOf(msg({ blind: false, whisper: [player] }), users) === 'self',
      'self document refs',
    );
    assert(modeOf(msg({ whisper: ['p2'] }), users) === 'blind-custom', 'blind player');
    assert(modeOf(msg({ blind: false, whisper: ['p2'] }), users) === 'custom', 'private player');
    assert(
      modeOf(msg({ whisper: ['deleted-user'] }), users) === 'blind-custom',
      'unknown recipient',
    );
  });
  await test('Recognises skills, spells, attributes, defences, and named self-control checks', () => {
    const cases = [
      ['[@actor@S:"Observation"]', 'Observation'],
      ['[!PER-4 darkness]', 'PER'],
      ['[@actor@!Sp:"Detect Magic"+2]', 'Detect Magic'],
      ['[Sk:Fast-Talk-2]', 'Fast-Talk'],
      ['[P:"Broadsword"]', 'Parry: Broadsword'],
      ['[B:"Shield"]', 'Block: Shield'],
      ['[CR:12 Bad Temper]', 'Self-control: Bad Temper'],
      ['["Display alias" !IQ]', 'IQ'],
    ];
    for (const [otf, expected] of cases) assert(labelFromOTF(otf) === expected, otf);
    assert(labelFromOTF('[S:"Observation"|S:"Search"]') === null, 'alternatives must not guess');
    assert(labelFromOTF('[3d6]') === null, 'raw dice generic');
  });
  await test('Metadata extraction reads only check heading and original target', () => {
    const result = describeCheck(card());
    assert(result.check === 'Observation' && result.baseTarget === 15, JSON.stringify(result));
    assert(!JSON.stringify(result).includes('SECRET'), 'secret leaked');
    assert(describeCheck('<div>SECRET_CRITICAL_FAILURE</div>').check === null, 'unknown card');
    assert(describeCheck(card() + card()).check === null, 'compound cards must not guess');
  });
  await test('Successful blind roll creates exactly one private result-free receipt', async () => {
    const s = setup();
    const m = await roll(s);
    await Promise.all([s.controller.after(m, {}, 'p1'), s.controller.after(m, {}, 'p1')]);
    assert(s.created.length === 1, 'duplicate receipt');
    const { data, options } = s.created[0];
    assert(data.author === 'p1' && data.whisper.join() === 'p1' && !data.blind, 'audience');
    assert(options.messageMode === 'self', 'V14 option');
    assert(data.content.includes('Luke') && data.content.includes('Observation'), 'missing check');
    assert(
      !data.content.includes('15') && !JSON.stringify(data).includes('SECRET'),
      'sensitive data copied',
    );
    assert(data.rolls.length === 0 && data.sound === null, 'receipt rolls or sound');
    assert(m.rolls[0].total === 18 && m.blind && m.whisper.length === 2, 'original roll modified');
  });
  await test('No receipt before successful creation or for cancelled roll', () => {
    const s = setup();
    s.controller.before(msg(), {}, {}, 'p1');
    assert(s.created.length === 0, 'premature receipt');
  });
  await test('Final public/private/self visibility overrides earlier blind intent', async () => {
    for (const whisper of [[], ['g1'], ['p1']]) {
      const s = setup(),
        m = msg();
      s.controller.before(m, {}, {}, 'p1');
      m.blind = false;
      m.whisper = whisper;
      await s.controller.after(m, {}, 'p1');
      assert(s.created.length === 0, 'receipt for nonblind roll');
    }
  });
  await test('GM-initiated roll on a player character stays silent', async () => {
    const s = setup({ viewer: gm });
    await roll(s, msg({ author: gm }), 'g1');
    assert(s.created.length === 0, 'GM receipt');
  });
  await test('Other clients, another tab, and delegated authors do not produce receipts', async () => {
    const s = setup(),
      m = msg();
    s.controller.before(m, {}, {}, 'p1');
    const otherTab = setup();
    await otherTab.controller.after(m, {}, 'p1');
    assert(otherTab.created.length === 0, 'other tab duplicate');
    await s.controller.after(m, {}, 'p2');
    assert(s.created.length === 0, 'other creator');
    const delegated = setup();
    await roll(delegated, msg({ author: gm }));
    assert(delegated.created.length === 0, 'delegated author');
  });
  await test('Receipts and blind non-roll messages cannot recurse', async () => {
    const s = setup();
    await roll(s, msg({ flags: { [ID]: { receipt: true } } }));
    await roll(s, msg({ rolls: [] }));
    assert(s.created.length === 0, 'non-roll/receipt trigger');
  });
  await test('Custom, mixed, unknown, or missing recipients do not claim GM-only delivery', async () => {
    for (const whisper of [[], ['p2'], ['g1', 'p2'], ['missing']]) {
      const s = setup();
      await roll(s, msg({ whisper }));
      assert(!s.created.length, whisper.join());
    }
  });
  await test('Audience choices preserve exactly the selected receipt recipients', async () => {
    for (const [audience, expected] of [
      ['self', 'p1'],
      ['gm', 'p1,g1,g2'],
      ['public', ''],
    ]) {
      const s = setup({ config: { audience } });
      await roll(s);
      assert(s.created[0].data.whisper.join() === expected, audience);
    }
    const s = setup({ config: { audience: 'off' } });
    await roll(s);
    assert(!s.created.length, 'off');
  });
  await test('Generic, named, and original-target detail modes exclude outcome information', async () => {
    for (const detail of ['generic', 'check', 'base']) {
      const s = setup({ config: { detail } });
      await roll(s);
      const text = s.created[0].data.content;
      assert(text.includes('Observation') === (detail !== 'generic'), detail);
      assert(text.includes('original target 15') === (detail === 'base'), detail);
      assert(!text.includes('SECRET'), detail);
    }
  });
  await test('Unknown/compound cards receive generic confirmation with no copied content', async () => {
    for (const content of ['SECRET_CRITICAL_FAILURE', card() + card(), card('[S:"One"|S:"Two"]')]) {
      const s = setup();
      await roll(s, msg({ content }));
      const text = s.created[0].data.content;
      assert(text.includes('Luke rolled.') && !text.includes('SECRET'), 'fallback');
    }
  });
  await test('Names cannot inject markup or executable OtF links into receipt', async () => {
    const s = setup();
    await roll(s, msg({ speaker: { alias: '<img src=x onerror=alert(1)> [S:Attack]' } }));
    const document = new DOMParser().parseFromString(s.created[0].data.content, 'text/html');
    assert(!document.querySelector('img,script,[data-otf]'), 'markup injection');
    assert(!document.body.textContent.includes('['), 'executable brackets');
  });
  await test('Receipt failure gives a precise notification without retrying the roll', async () => {
    const s = setup({ fail: true });
    const m = await roll(s);
    await s.controller.after(m, {}, 'p1');
    assert(
      s.notifications.length === 1 && s.notifications[0].includes('blind roll was created'),
      'failure feedback',
    );
    assert(m.rolls.length === 1 && m.rolls[0].total === 18, 'changed roll');
  });
  await test('Labels are idempotent and refresh when a blind result is revealed', () => {
    const html = document.createElement('li');
    html.innerHTML =
      '<header class="message-header">Luke</header><div class="message-content">Result</div>';
    const m = msg();
    decorate(m, html, { users });
    decorate(m, html, { users });
    assert(html.querySelectorAll('.grc-mode-label').length === 1, 'duplicate badge');
    assert(html.textContent.includes('player cannot see result'), 'blind label');
    m.blind = false;
    m.whisper = [];
    decorate(m, html, { users });
    assert(html.querySelector('.grc-mode-label').textContent === 'Public', 'stale blind label');
    assert(!html.classList.contains('grc-mode-blind'), 'stale border');
  });
  await test('Invisible messages remain untouched; visible blind placeholders gain only a mode label', () => {
    const hidden = document.createElement('li');
    hidden.textContent = 'Hidden';
    decorate(msg({ visible: false }), hidden, { users });
    assert(hidden.textContent === 'Hidden' && !hidden.className, 'invisible message changed');
    const html = document.createElement('li');
    html.innerHTML =
      '<header class="message-header">Luke</header><div class="message-content">Hidden result</div>';
    const content = html.querySelector('.message-content');
    decorate(msg({ visible: true, isContentVisible: false }), html, { users });
    assert(
      html.querySelector('.grc-mode-label').textContent.includes('Blind to GM'),
      'missing placeholder badge',
    );
    assert(
      content.textContent === 'Hidden result' && !html.textContent.includes('SECRET'),
      'result exposed',
    );
    decorate(msg(), html, { users, showLabels: false, borders: false });
    assert(!html.querySelector('.grc-mode-label') && !html.className, 'disabled styling remains');
  });
  await test('Labels and borders work independently', () => {
    for (const showLabels of [true, false])
      for (const borders of [true, false]) {
        const html = document.createElement('li');
        decorate(msg(), html, { users, showLabels, borders });
        assert(!!html.querySelector('.grc-mode-label') === showLabels, 'labels setting');
        assert(html.classList.contains('grc-mode-blind') === borders, 'borders setting');
      }
  });
  await test('GM mode preserves populated recipients and fills only an empty recipient list', () => {
    const explicit = applyMode({ whisper: ['p1', 'g1'], blind: true }, 'gm', player);
    assert(explicit.whisper.join() === 'p1,g1' && !explicit.blind, 'explicit list overwritten');
    const empty = applyMode({ whisper: [], blind: true }, 'gm', player);
    assert(empty.whisper.join() === 'g1,g2' && !empty.blind, 'empty list not populated');
    const blind = applyMode({ whisper: ['g2'], blind: false }, 'blind', player);
    assert(blind.whisper.join() === 'g2' && blind.blind, 'blind subset overwritten');
  });
  await test('Receipt to one of several GMs excludes the other GM', async () => {
    const s = setup({ config: { audience: 'gm' } });
    await roll(s, msg({ whisper: ['g1'] }));
    assert(s.created.length === 1, 'missing receipt');
    assert(s.created[0].data.whisper.join() === 'p1,g1', 'receipt audience widened');
  });
  await test('World policy changes apply to subsequent rolls without a reload', async () => {
    const s = setup();
    await roll(s);
    s.settings.audience = 'gm';
    s.settings.detail = 'generic';
    await roll(s, msg({ id: 'm2', whisper: ['g2'] }));
    assert(s.created[1].data.whisper.join() === 'p1,g2', 'stale audience');
    assert(!s.created[1].data.content.includes('Observation'), 'stale detail');
    s.settings.audience = 'off';
    await roll(s, msg({ id: 'm3' }));
    assert(s.created.length === 2, 'off setting ignored');
  });
  await test('Template changes degrade safely to generic receipts', async () => {
    const s = setup();
    await roll(s, msg({ content: card().replace('class="prefix"', 'class="new-heading"') }));
    const text = s.created[0].data.content;
    assert(text.includes('Luke rolled.') && !text.includes('SECRET'), 'unsafe template fallback');
  });
  const hooks = new Map(),
    settings = new Map(),
    definitions = new Map(),
    saved = [],
    notifications = [];
  globalThis.Hooks = { once: (key, fn) => hooks.set(key, fn), on: (key, fn) => hooks.set(key, fn) };
  globalThis.game = {
    system: { id: 'gurps', version: '0.18.23' },
    release: { generation: 14 },
    user: player,
    users,
    messages: new Map(),
    settings: {
      register: (_id, key, data) => {
        settings.set(key, data.default);
        definitions.set(key, data);
      },
      get: (_id, key) => settings.get(key),
    },
  };
  globalThis.ui = {
    notifications: { warn: (text) => notifications.push(text) },
    chat: {
      render: () => {
        throw new Error('Chat should not be rebuilt for appearance settings');
      },
    },
  };
  class MockMessage {
    static schema = {
      fields: Object.fromEntries(
        ['author', 'blind', 'whisper', 'rolls', 'content', 'speaker', 'flags'].map((key) => [
          key,
          {},
        ]),
      ),
    };
    static applyMode(data, mode) {
      return applyMode(data, mode, player);
    }
    static async create(data, options) {
      applyMode(data, options.messageMode, player);
      saved.push({ data, options });
      return { id: 'receipt' };
    }
    updateSource() {}
    renderHTML() {}
  }
  globalThis.foundry = {
    utils: { randomID: () => 'integration-token' },
    documents: { ChatMessage: MockMessage },
  };
  const entry = await import('../scripts/main.js');
  await test('V14 entry point registers settings/hooks and creates receipt through lifecycle', async () => {
    hooks.get('init')();
    hooks.get('ready')();
    assert(settings.size === 4 && !notifications.length, 'activation or settings');
    const m = msg();
    hooks.get('preCreateChatMessage')(m, {}, {}, 'p1');
    hooks.get('createChatMessage')(m, {}, 'p1');
    await new Promise((r) => setTimeout(r, 0));
    assert(
      saved.length === 1 &&
        saved[0].options.messageMode === 'self' &&
        saved[0].data.author === 'p1',
      'V14 receipt',
    );
  });
  await test('Cosmetics are client settings; policy remains world-scoped with no reload requirements', () => {
    for (const key of ['labels', 'borders']) {
      assert(definitions.get(key).scope === 'client', key);
      assert(typeof definitions.get(key).onChange === 'function', key + ' refresh');
    }
    for (const key of ['audience', 'detail']) assert(definitions.get(key).scope === 'world', key);
    assert(
      [...definitions.values()].every((d) => d.requiresReload === false),
      'reload requirement',
    );
  });
  await test('Appearance changes immediately refresh existing cards without touching content or creating messages', () => {
    const m = msg();
    game.messages.set(m.id, m);
    const nodes = [document.createElement('li'), document.createElement('li')];
    for (const html of nodes) {
      html.innerHTML = '<div class="message-content">Hidden result</div>';
      hooks.get('renderChatMessageHTML')(m, html);
      document.body.append(html);
    }
    const before = saved.length;
    settings.set('labels', false);
    definitions.get('labels').onChange(false);
    for (const html of nodes)
      assert(
        !html.querySelector('.grc-mode-label') && html.classList.contains('grc-mode-blind'),
        'labels-only toggle',
      );
    settings.set('borders', false);
    definitions.get('borders').onChange(false);
    for (const html of nodes) assert(!html.className, 'border removal');
    settings.set('labels', true);
    definitions.get('labels').onChange(true);
    for (const html of nodes)
      assert(
        html.querySelector('.grc-mode-label') &&
          html.querySelector('.message-content').textContent === 'Hidden result',
        'label restore',
      );
    assert(saved.length === before, 'appearance produced a message');
    nodes.forEach((html) => html.remove());
  });
  await test('Future Foundry versions pass only when required chat capabilities remain available', () => {
    const future = { ...game, release: { generation: 15 } };
    assert(entry.compatibilityProblem(future) === null, 'compatible future blocked');
    assert(
      entry.compatibilityProblem({ ...game, release: { generation: 13 } }),
      'unsupported old core',
    );
    assert(
      entry.compatibilityProblem({ ...game, system: { version: '0.19.0' } }),
      'unsupported system',
    );
    assert(
      entry.compatibilityProblem(future, {
        utils: foundry.utils,
        documents: { ChatMessage: { create() {} } },
      }),
      'missing APIs accepted',
    );
    const version = game.release.generation;
    game.release.generation = 15;
    hooks.get('ready')();
    game.release.generation = version;
    assert(
      notifications.some((text) => text.includes('has not been verified')),
      'missing future-version warning',
    );
  });
  return results;
}
