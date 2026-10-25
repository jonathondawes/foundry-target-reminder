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

Pending. Local test installation targets Foundry 13.351 / PF2e 7.10.1. Foundry 14.369 APIs and current PF2e button names were reviewed against official documentation/source, but Foundry 14 has not been run here.
