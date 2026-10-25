# Live validation

Use a backed-up test world with a GM session and at least two separate player sessions. Record Foundry/PF2e versions for each run. Test with Foundry 13 and latest stable Foundry 14 plus a compatible PF2e system before claiming full verification.

1. GM: no targets, started combat, click a strike/spell attack. No popup. Select a target, advance through player and NPC turns; the GM target stays selected.
2. Player A: start on A's turn with no targets. Click a strike, select an enemy and confirm. Exactly one attack rolls against the selected target, including its AC and relevant target-dependent conditions. Repeat for spell attacks, MAP variants and elemental blasts. Check a ranged attack with a range penalty.
3. Roll damage and a second attack during the same turn. Targets remain selected. No automatic damage roll is created.
4. Have A and B each select targets. Advance from A's combatant to B's. Only A's targets clear. Advance from B to an NPC; only B's clear. A must select a target for their next turn.
5. Repeat with an actor owned by two players, multiple combatants owned by one player, single-combatant round rollover, active combatant removal, encounter reset/deactivation/deletion, and initiative edits that leave the same active combatant. Only outgoing owners clear; unchanged turns do not clear.
6. Check popup close (cancels the attack), Roll Without Target, no selected radio, rapid repeated clicks, Shift/Ctrl/Command modifiers, and keyboard activation. Exactly one original attack continues after a selection.
7. While a popup is open, advance the turn, hide/defeat/remove the chosen target or close the original sheet. The old attack must not roll or re-target after the change.
8. Confirm hidden/invisible/off-scene/defeated targets and the controlled attacker are excluded. Check friendly/other-player-owned visible targets remain available.
9. Toggle each targeting preference off and on. Confirm existing saved preferences survive the update. Check outside combat, before combat starts, unrelated encounters/scenes and a non-owner spectator.
10. Check direct attack macros/third-party HUDs: documented popup coverage is native PF2e attack-button click paths. Turn cleanup still applies. Check any other modules used by your group for click-handler compatibility.

## Automated validation

21 Node.js regression checks pass. Source syntax and diff whitespace checks pass.

## Live results

### 25 October 2026 — Foundry 13.351 / PF2e 7.10.1

Ran separate Gamemaster and Test_User1 sessions in AV Test, using an isolated Target Reminder QA scene and copied actors. Original actors were not changed.

Passed live checks:
- Target Reminder 2.1.0 is enabled.
- Final popup styling verified: radio controls have a visible 17.6px box and can be checked directly, with a clear selected-row highlight.
- A player without a target receives the popup from the native strike button.
- Selecting QA Enemy continues exactly one original attack; its chat result names QA Enemy and AC 17.
- No damage roll is generated automatically. Manual weapon damage works.
- After that damage roll, a second attack goes directly to PF2e's normal roll dialog: the target is retained.
- Advancing from the player's turn to the enemy's clears the player's target; the next attack prompts again.
- Round rollover returns to the player's next turn with a fresh reminder.
- A popup left open across a turn change cancels the old attack and reports that the encounter changed.
- A GM attack without targets goes straight to PF2e's roll dialog with no reminder.
- The GM's independent target survives both player-to-enemy transition and round rollover; a later GM attack still names QA Enemy and AC 17.

Not yet live-verified: spell/elemental/familiar paths, keyboard/MAP modifiers, rapid clicks, multiple player owners, active-combatant deletion and a running Foundry 14/PF2e combination. Automated checks cover these guards where listed above. Foundry 14.369 APIs and current PF2e button names were reviewed against official documentation/source; verified remains 13.

The QA scene, copied actors and setup macro remain in the test world for repeat testing. The QA encounter is left running; no encounter was ended and no QA damage was applied to an actor.
