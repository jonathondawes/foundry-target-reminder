# Target Reminder

Target reminders and end-of-turn target cleanup for **Pathfinder 2e**, designed for Foundry VTT **13–14**.

## Behaviour

- Players who click a supported attack button during a started encounter without a target see **Select Target**. GMs never receive the reminder.
- Choose a visible, undefeated combatant and click **Target Selected** to continue the attack. PF2e calculates the roll after targeting, including AC and target-dependent modifiers.
- **Roll Without Target** continues without choosing a target. Closing the popup cancels that attack.
- Targets stay selected between attacks and damage rolls in the same turn.
- When the active combatant changes, players who own the outgoing combatant have their own targets cleared. This also handles round rollover, a single-combatant encounter, and removal of the active combatant. Other players and GMs keep their targets.
- Ending, resetting or deactivating the encounter clears the outgoing owner's targets too.
- Automatic damage rolls have been removed. Use PF2e's normal damage controls.

Ownership means Foundry's **Owner** permission on the outgoing actor. If multiple players own that actor, each connected owner clears their own targets. If one player owns multiple combatants, targets clear at each of those combatants' turn transitions. Cleanup only applies to the encounter on the scene the player is viewing.

## Supported attack controls

Native PF2e sheet and chat-card strike buttons (including multiple attack penalties), spell attack buttons, elemental-blast attack buttons and familiar attack buttons are supported. Keyboard activation of these buttons is supported through their click event.

Macros and third-party HUD controls that call the roll API directly, without clicking a supported PF2e button, do not display the popup. Their targets still clear at turn end. The module deliberately leaves PF2e's roll API and calculated roll context untouched.

Hidden, out-of-sight, defeated, off-scene and currently controlled tokens are excluded from the popup. If no eligible targets are available, the normal attack proceeds. A pending attack is canceled if the encounter changes or its selected target becomes unavailable.

## Settings

In **Configure Settings → Target Reminder**, each player can toggle:

- **Show Target Reminder** (on by default).
- **Clear Targets at End of Turn** (on by default).

The existing `autoTargetPrompt` and `autoClearTargets` preferences are preserved. `autoClearTargets` now applies at turn end instead of after damage. GMs are excluded regardless of these settings.

## Installation for testing

Copy `module.json`, `scripts/` and `styles/` into `Data/modules/foundry-target-reminder`, then reload Foundry and enable **Target Reminder** in the test world's Manage Modules screen. Back up any existing module first.

This branch is not a published release. The blank manifest/download fields remain until release packaging is prepared.

## Compatibility and validation

Foundry 14.369 is the latest stable release checked on 25 October 2026. This implementation uses `DialogV2`, `combatTurnChange` and `Token.setTarget`, which are available in Foundry 13 and 14. The removed `User.updateTokenTargets` API is no longer used.

- [Foundry release notes](https://foundryvtt.com/releases/)
- [v14 turn-change hook](https://foundryvtt.com/api/v14/functions/hookEvents.combatTurnChange.html)
- [v14 Token target API](https://foundryvtt.com/api/v14/classes/foundry.canvas.placeables.Token.html#setTarget)
- [PF2e strike buttons](https://github.com/foundryvtt/pf2e/blob/master/static/templates/actors/character/partials/strike.hbs)

Run `node --test tests/target-reminder.test.cjs` with Node.js 18 or newer. These tests mock Foundry and DOM interactions; they do not certify a running Foundry 14/PF2e combination. See [the live test checklist](tests/FOUNDRY-UAT.md). The manifest keeps `verified: 13` until Foundry 14 live testing is recorded.
