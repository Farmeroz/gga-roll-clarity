/** Pure policy and DOM helpers. No rolling, sockets, or GGA method replacement. */
export const ID = 'gga-roll-clarity';

export function idOf(value) {
  return typeof value === 'string' ? value : (value?.id ?? value?._id ?? null);
}

export function authorId(message) {
  return (
    idOf(message.author) ??
    idOf(message.user) ??
    idOf(message._source?.author) ??
    idOf(message._source?.user)
  );
}

export function recipients(message) {
  return Array.from(message.whisper ?? [], idOf).filter(Boolean);
}

export function hasRoll(message) {
  return message.isRoll === true || (message.rolls?.length ?? 0) > 0;
}

export function modeOf(message, users) {
  const ids = recipients(message);
  const allGM = ids.length > 0 && ids.every((id) => users.get(id)?.isGM === true);
  if (message.blind) return allGM ? 'blind' : 'blind-custom';
  if (!ids.length) return 'public';
  if (ids.length === 1 && ids[0] === authorId(message)) return 'self';
  if (
    ids.some((id) => users.get(id)?.isGM) &&
    ids.every((id) => id === authorId(message) || users.get(id)?.isGM)
  )
    return 'gm';
  return 'custom';
}

export function canReceipt(message, creatorId, viewer, users) {
  return (
    !!viewer &&
    !viewer.isGM &&
    viewer.id === creatorId &&
    authorId(message) === creatorId &&
    hasRoll(message) &&
    !message.flags?.[ID]?.receipt &&
    modeOf(message, users) === 'blind'
  );
}

export function safeText(value, max = 180) {
  // Receipts must stay plain text even when GGA's chat enrichment runs later.
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Conservative fallback for ordinary GGA OtFs; never copy the entire command. */
export function labelFromOTF(value) {
  let text = String(value ?? '').trim();
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1).trim();
  // Strip actor references, blind markers, and leading display aliases only.
  for (let n = 0; n < 4; n++) {
    const previous = text;
    text = text
      .replace(/^@[^@]+@\s*/, '')
      .replace(/^!\s*/, '')
      .replace(/^(?:"[^"]*"|'[^']*')\s*(?=!?\s*(?:@|[A-Za-z]))/, '');
    if (previous === text) break;
  }
  // Alternatives may resolve to a different check than the first name. Do not guess.
  const operators = text.replace(/"[^"]*"|'[^']*'/g, '');
  if (/[|<>]/.test(operators)) return null;
  const named = /^(Sk|Sp|S|M|R|A|P|B):\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^?<>|\[\]{}]+))/i.exec(text);
  if (named) {
    let name = named[2] ?? named[3] ?? named[4];
    if (!named[2] && !named[3]) name = name.split(/\s*[+−–-]\s*\d|\s*\*|\s*=\s*\d/)[0];
    name = safeText(name);
    if (!name) return null;
    const kind = named[1].toUpperCase();
    return kind === 'P' ? `Parry: ${name}` : kind === 'B' ? `Block: ${name}` : name;
  }
  const attribute =
    /^(FRIGHT\s?CHECK|TASTE\s?SMELL|VISION|HEARING|TOUCH|SMELL|TASTE|DODGE|PARRY|BLOCK|WILL|PER|ST|DX|IQ|HT|QN)(?=$|[\s\d+−–\-?:])/i.exec(
      text,
    );
  if (attribute) return safeText(attribute[1]);
  const control = /^CR:\s*\d+(?:\s+([^?{}\[\]]+))?/i.exec(text);
  if (control) return control[1] ? `Self-control: ${safeText(control[1])}` : 'Self-control';
  return null;
}

/** Read only the GGA card's check heading and original target, never its result area. */
export function describeCheck(content, Parser = globalThis.DOMParser) {
  if (!Parser || typeof content !== 'string') return { check: null, baseTarget: null };
  const document = new Parser().parseFromString(content, 'text/html');
  const cards = document.querySelectorAll('.roll-message');
  if (cards.length !== 1) return { check: null, baseTarget: null };
  const prefix = cards[0].querySelector(':scope > .prefix');
  const heading = prefix?.querySelector(':scope > .roll-result');
  if (!heading) return { check: null, baseTarget: null };
  // Older/enriched cards may already contain an OtF link. Its command remains input metadata.
  const command =
    heading.querySelector('[data-otf]')?.getAttribute('data-otf') ?? heading.textContent;
  const check = labelFromOTF(command);
  let suffix = '';
  for (let node = heading.nextSibling; node; node = node.nextSibling) {
    if (node.nodeType === 3) suffix += node.textContent;
    else return { check, baseTarget: null };
  }
  const match = /^\s*\((\d{1,4})\)\s*$/.exec(suffix);
  return { check, baseTarget: check && match ? Number(match[1]) : null };
}

export function makeReceipt({
  sourceId,
  rollerId,
  character,
  check,
  baseTarget,
  audience,
  detail,
  gmIds,
}) {
  const name = escapeHTML(safeText(character) || 'Your character');
  const subject =
    detail !== 'generic' && check ? ` against <strong>${escapeHTML(safeText(check))}</strong>` : '';
  const base =
    subject && detail === 'base' && Number.isInteger(baseTarget) && baseTarget > 0
      ? ` (original target ${baseTarget}, before roll modifiers)`
      : '';
  const whisper =
    audience === 'public'
      ? []
      : audience === 'gm'
        ? [...new Set([rollerId, ...gmIds])]
        : [rollerId];
  return {
    author: rollerId,
    speaker: { alias: 'Roll confirmation' },
    content: `<section class="grc-receipt"><strong>Blind roll submitted</strong><p>${name} rolled${subject}${base}.</p><p>Result sent to the GM.</p></section>`,
    whisper,
    blind: false,
    rolls: [],
    sound: null,
    flags: { [ID]: { receipt: true, sourceMessageId: sourceId } },
  };
}

export const LABELS = {
  public: 'Public',
  gm: 'Private to GM – roller can see result',
  blind: 'Blind to GM – player cannot see result',
  self: 'Self Only',
  custom: 'Private – custom recipients',
  'blind-custom': 'Blind – custom or missing recipients',
};

export function decorate(message, html, { users, showLabels = true, borders = true }) {
  if (!html?.querySelectorAll) return;
  html.querySelectorAll('.grc-mode-label').forEach((node) => node.remove());
  for (const cls of [...html.classList])
    if (cls.startsWith('grc-mode-')) html.classList.remove(cls);
  if (message.visible === false || !hasRoll(message) || message.flags?.[ID]?.receipt) return;
  const mode = modeOf(message, users);
  if (borders) html.classList.add(`grc-mode-${mode}`);
  if (!showLabels) return;
  const badge = html.ownerDocument.createElement('div');
  badge.className = 'grc-mode-label';
  badge.textContent = LABELS[mode];
  badge.tabIndex = 0;
  badge.dataset.help = {
    public: 'Everyone can see this roll result.',
    gm: 'The rolling user and the addressed GMs can see this result.',
    blind: 'The addressed GMs can see the result. The player receives no outcome from this label.',
    self: 'Only the user who rolled can see this result.',
    custom: 'This roll uses a custom private recipient list.',
    'blind-custom':
      'This blind roll uses a custom or missing recipient list. Check the intended audience with the GM.',
  }[mode];
  const header = html.querySelector('.message-header');
  if (header) header.after(badge);
  else html.prepend(badge);
}

/** Each browser keeps only its own pending requests: other tabs/clients cannot duplicate receipts. */
export class ReceiptController {
  constructor({
    user,
    users,
    settings,
    describe = describeCheck,
    randomId,
    create,
    notify,
    now = Date.now,
  }) {
    Object.assign(this, { user, users, settings, describe, randomId, create, notify, now });
    this.pending = new Map();
  }

  before(message, _data, _options, creatorId) {
    const user = this.user();
    const settings = this.settings();
    if (
      !user ||
      user.isGM ||
      creatorId !== user.id ||
      authorId(message) !== user.id ||
      !hasRoll(message) ||
      message.flags?.[ID]?.receipt ||
      settings.audience === 'off'
    )
      return;
    for (const [key, entry] of this.pending)
      if (this.now() - entry.created > 600_000) this.pending.delete(key);
    const token = this.randomId();
    const description =
      settings.detail === 'generic'
        ? { check: null, baseTarget: null }
        : this.describe(message.content);
    this.pending.set(token, {
      ...description,
      character: safeText(message.speaker?.alias) || safeText(user.name) || 'Your character',
      created: this.now(),
      audience: settings.audience,
      detail: settings.detail,
    });
    message.updateSource({ [`flags.${ID}.requestToken`]: token });
  }

  async after(message, _options, creatorId) {
    const token = message.flags?.[ID]?.requestToken;
    const pending = this.pending.get(token);
    if (!pending) return;
    this.pending.delete(token);
    if (
      !canReceipt(message, creatorId, this.user(), this.users()) ||
      this.settings().audience === 'off'
    )
      return;
    const users = this.users();
    const receipt = makeReceipt({
      ...pending,
      sourceId: message.id,
      rollerId: creatorId,
      gmIds: recipients(message).filter((id) => users.get(id)?.isGM),
    });
    try {
      // V14 messageMode, not the pre-V14 rollMode. Explicit mode avoids inheriting Blind.
      const created = await this.create(receipt, {
        messageMode:
          pending.audience === 'public' ? 'public' : pending.audience === 'gm' ? 'gm' : 'self',
      });
      if (!created) throw new Error('Receipt creation cancelled');
    } catch {
      this.notify(
        'The blind roll was created, but its confirmation could not be saved. Please ask the GM to confirm it.',
      );
    }
  }
}
