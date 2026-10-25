# Changelog

## 2.1.0 — Unreleased

- Exclude GMs from reminders and target cleanup.
- Clear a player's targets when a combatant they own finishes its turn, instead of after damage.
- Handle round rollover, multiple owned combatants, removal of the active combatant, and encounter end/reset/deactivation.
- Select targets before PF2e calculates the attack, preserving its AC, range and target-dependent modifier handling.
- Replace the Check.roll patch and delayed chat-message cleanup with native button interception and Foundry's turn-change hook.
- Use Foundry 13/14 DialogV2 and Token.setTarget APIs.
- Remove automatic damage, as requested; damage remains controlled by PF2e.
- Escape popup content, filter unavailable targets, and prevent queued duplicate attacks.
- Preserve existing player targeting preferences; document direct-macro/HUD limitations.
- Add automated regression checks and a live test checklist.
