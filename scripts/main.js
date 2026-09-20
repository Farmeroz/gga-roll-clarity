import * as log from './log.mjs';
import { ID, ReceiptController, decorate } from './core.js';

let active = false;
const renderedCards = new Set();
const cardMessages = new WeakMap();

function appearance() {
  return {
    users: game.users,
    showLabels: game.settings.get(ID, 'labels'),
    borders: game.settings.get(ID, 'borders'),
    timestamps: game.settings.get(ID, 'timestamps'),
  };
}

function refreshAppearance() {
  if (!active) return;
  const options = appearance();
  for (const ref of renderedCards) {
    const html = ref.deref();
    if (!html) {
      renderedCards.delete(ref);
      continue;
    }
    if (!html.isConnected) continue;
    const previous = cardMessages.get(html);
    const message = game.messages?.get(previous?.id) ?? previous;
    if (message) decorate(message, html, options);
  }
}

export function compatibilityProblem(environment, api = globalThis.foundry) {
  const generation = Number(environment.release?.generation);
  if (!Number.isFinite(generation) || generation < 14) return 'Foundry V14 or later is required.';
  if (!/^0\.18\./.test(environment.system?.version)) return 'GGA 0.18.x is required.';
  const Message = api?.documents?.ChatMessage;
  const fields = Message?.schema?.fields ?? Message?.schema;
  if (
    typeof Message?.create !== 'function' ||
    typeof Message?.applyMode !== 'function' ||
    typeof Message?.prototype?.updateSource !== 'function' ||
    typeof Message?.prototype?.renderHTML !== 'function' ||
    typeof api?.utils?.randomID !== 'function' ||
    typeof environment.users?.get !== 'function' ||
    typeof globalThis.DOMParser !== 'function' ||
    typeof globalThis.WeakRef !== 'function' ||
    !['author', 'blind', 'whisper', 'rolls', 'content', 'speaker', 'flags'].every(
      (key) => fields?.[key],
    )
  ) {
    return 'Required chat features are unavailable. GGA Roll Clarity has not activated.';
  }
  return null;
}

Hooks.once('init', () => {
  if (game.system.id !== 'gurps') return;
  const common = { config: true, requiresReload: false };
  game.settings.register(ID, 'labels', {
    ...common,
    scope: 'client',
    onChange: refreshAppearance,
    name: 'Show roll visibility labels',
    type: Boolean,
    default: true,
    hint: 'Show mode labels on your chat cards, including your blind-roll placeholders.',
  });
  game.settings.register(ID, 'borders', {
    ...common,
    scope: 'client',
    onChange: refreshAppearance,
    name: 'Add coloured roll borders',
    type: Boolean,
    default: true,
    hint: 'Show a coloured border on your roll cards. This works independently of labels.',
  });
  game.settings.register(ID, 'timestamps', {
    ...common,
    scope: 'client',
    onChange: refreshAppearance,
    name: 'Show exact local timestamps',
    type: Boolean,
    default: true,
    hint: 'Show the saved date and local time, including seconds, on chat messages. Turn off to use Foundry’s usual time display.',
  });
  game.settings.register(ID, 'audience', {
    ...common,
    scope: 'world',
    name: 'Blind-roll confirmation audience',
    type: String,
    default: 'self',
    choices: {
      self: 'Rolling player only',
      gm: 'Rolling player and recipient GMs',
      public: 'Everyone',
      off: 'No confirmations',
    },
    hint: 'Choose who sees confirmations of player-submitted blind rolls. GM-initiated rolls stay silent. Applies to subsequent rolls.',
  });
  game.settings.register(ID, 'detail', {
    ...common,
    scope: 'world',
    name: 'Blind-roll confirmation detail',
    type: String,
    default: 'check',
    choices: {
      generic: 'Character only',
      check: 'Character and check name',
      base: 'Character, check, and original target',
    },
    hint: 'Only include the original target if players may know it. Unrecognised checks receive a generic confirmation. Applies to subsequent rolls.',
  });
  // Register before the initial chat render, so existing cards also get refreshed at ready.
  Hooks.on('renderChatMessageHTML', (message, html) => {
    if (!html?.querySelectorAll || typeof globalThis.WeakRef !== 'function') return;
    if (!cardMessages.has(html)) renderedCards.add(new WeakRef(html));
    cardMessages.set(html, message);
    if (active) decorate(message, html, appearance());
  });
});

Hooks.once('ready', () => {
  if (game.system.id !== 'gurps') return;
  const problem = compatibilityProblem(game);
  if (problem) {
    ui.notifications.warn(`GGA Roll Clarity: ${problem}`);
    return;
  }
  if (Number(game.release.generation) > 14) {
    ui.notifications.warn(
      'GGA Roll Clarity has not been verified with this Foundry version. Check blind-roll visibility before play.',
    );
  }
  active = true;
  const settings = () => ({
    audience: game.settings.get(ID, 'audience'),
    detail: game.settings.get(ID, 'detail'),
  });
  const controller = new ReceiptController({
    user: () => game.user,
    users: () => game.users,
    settings,
    randomId: () => foundry.utils.randomID(24),
    create: (data, options) => foundry.documents.ChatMessage.create(data, options),
    notify: (message) => ui.notifications.warn(message),
  });
  Hooks.on('preCreateChatMessage', (...args) => {
    try {
      controller.before(...args);
    } catch (error) {
      log.error('Preparing a roll confirmation', error);
      ui.notifications.warn(
        'GGA Roll Clarity could not prepare a confirmation. The roll can still proceed.',
      );
    }
  });
  Hooks.on('createChatMessage', (...args) => {
    void controller.after(...args).catch((error) => {
      log.error('Posting a roll confirmation', error);
      ui.notifications.warn(
        'GGA Roll Clarity could not confirm this roll. Please check with the GM.',
      );
    });
  });
  refreshAppearance();
});
