import { createHelpController, helpResolver } from './tooltip-engine.mjs';
export const helpConfig = {
  id: 'gga-roll-clarity',
  scope:
    '.grc-mode-label, .grc-receipt, .grc-blind-label, .grc-exact-timestamp, [name^="gga-roll-clarity."], [data-key^="gga-roll-clarity."], [data-tool="gga-roll-clarity"], [data-control="gga-roll-clarity"]',
  actions: {},
  fields: {},
  rules: [
    [
      '[name$=".helpTooltips"]',
      'Show or hide optional hover and keyboard help for this client. Essential labels and notices remain visible.',
    ],
  ],
  actionAttributes: ['data-action'],
};
let resolve = helpResolver(helpConfig);

export const helpController = createHelpController({ ...helpConfig, resolve });
if (globalThis.Hooks) {
  Hooks.once('init', () => helpController.register());
  Hooks.once('ready', () => helpController.start());
}
