# Testing

Start with the setup commands in [CONTRIBUTING.md](CONTRIBUTING.md).

## Automated coverage

Recovered tests cover standard and custom audiences, blind-roll privacy, safe receipt content, failure/retry behaviour, existing and live chat decoration, and Foundry lifecycle handling. The same suite runs in Happy DOM and Chromium with mocked Foundry services.

The suite exercises these behaviours but does not claim complete coverage or reproduce a connected Foundry world. All automated cases should run; the standard test command treats skipped Node tests as a failure. Test output is saved under `test-output/`; browser diagnostics also use `tests/artifacts/` or `tests/results.json`.

## Source fixtures

No external source download is needed. Setup confirms that the suite uses its local fixtures or mocks.

## Live check

With a player connected, check public, private, blind, and self-only rolls. Confirm blind receipts contain only the configured details and GM-initiated blind rolls stay silent for players.

Use your normal Foundry/GGA versions and module combination, and refresh connected clients after updating. Record unexpected notifications, visibility changes, or changed resource totals, together with the module versions and steps to reproduce them.

## Package verification

The build checks module/package versions, install URLs, declared assets, local imports, the allowed archive file list, and every archived file's bytes. The release ZIP contains only runtime files, the licence, and user documentation.
