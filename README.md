# GGA Roll Clarity

**Version 0.1.3 · Phil Brown**

Roll visibility labels and blind-roll confirmations for GURPS 4e Game Aid. Designed for Foundry VTT V14 and GGA 0.18.x.

## Install or update

1. From Foundry's **Setup** screen, open **Add-on Modules**.
2. Paste `https://github.com/Farmeroz/gga-roll-clarity/releases/latest/download/module.json` into **Manifest URL** and select **Install**.
3. Open your GURPS world and enable **GGA Roll Clarity** in **Manage Modules**. Reload if prompted.

For a manual installation, download the versioned ZIP from [GitHub Releases](https://github.com/Farmeroz/gga-roll-clarity/releases) and extract its `gga-roll-clarity` folder into `Data/modules/`.

## Roll as usual

Choose your roll mode in Foundry, then roll from your character sheet, chat, or a macro.

| Mode          | Who sees the result?                                       |
| ------------- | ---------------------------------------------------------- |
| Public        | Everyone                                                   |
| Private to GM | The rolling player and recipient GMs                       |
| Blind to GM   | Recipient GMs; the player receives a separate confirmation |
| Self Only     | The person who rolled                                      |

Roll cards display a mode label and coloured border. Your own visible blind-roll placeholder also receives a label while its result stays hidden. Custom recipient lists are labelled separately. If a result is revealed, its label follows the updated visibility.

A blind-roll confirmation looks like this:

> **Blind roll submitted**  
> Luke rolled against **Observation**.  
> Result sent to the GM.

The confirmation means the roll was submitted, not that a GM has read it. A GM making a secret roll on a character's behalf does not trigger a player confirmation.

## Choose your appearance

Open **Configure Settings → GGA Roll Clarity**.

- **Show roll visibility labels:** turn labels on or off for your own view.
- **Add coloured roll borders:** turn borders on or off independently.

These are personal settings for the browser or app you are using. Changes apply immediately to existing cards. After updating from an earlier release, choose your preferred appearance in these settings.

## Configure confirmations as GM

In the same settings panel, choose the audience and detail for future blind-roll confirmations. These settings apply to the whole world and take effect without reloading.

### Audience

- **Rolling player only:** only the submitting player receives the confirmation. This is the default.
- **Rolling player and recipient GMs:** the player and the GMs addressed by the original roll receive it.
- **Everyone:** the whole group sees that the roll was made, with the detail selected below.
- **No confirmations:** disable confirmation messages.

### Detail

- **Character only:** identify who rolled.
- **Character and check name:** also name the skill, attribute, or recognised check. This is the default.
- **Character, check, and original target:** also show the original target printed in GGA's roll heading, before roll modifiers. Choose this only when that number is suitable for players to see.

Confirmations do not show dice, roll modifiers, effective targets, margins, or success/failure. Checks that cannot be identified reliably receive a generic confirmation.

## Using blind rolls

Confirmations are saved in chat and remain after a reload. Existing rolls do not receive retrospective confirmations. A lost connection can prevent a confirmation from appearing even when the roll succeeded; ask the GM before rolling again.

GGA actions and macros that announce success or failure can still reveal an outcome separately. Check those actions before using them for secret rolls.

## Disable

Untick **GGA Roll Clarity** in **Manage Modules** and reload. Existing confirmation messages remain in chat.

Report problems through [GitHub Issues](https://github.com/Farmeroz/gga-roll-clarity/issues). Released under the [MIT licence](LICENSE.txt).

GURPS is a trademark of Steve Jackson Games. This unofficial module is not affiliated with or endorsed by Steve Jackson Games, Foundry Gaming LLC, or the GURPS Game Aid maintainers.

## Help tooltips

Hover over a control or focus it with the keyboard for a short explanation. Press Escape to dismiss the help. Under **Configure Settings → Module Settings → GGA Roll Clarity**, turn off **Show help tooltips** to hide optional help on your client. Labels, settings descriptions, and important notices remain visible. Other users keep their own preference.
