Hooks.once("init", () => {
    console.log("Target Reminder | Initializing module");

    game.settings.register("foundry-target-reminder", "autoTargetPrompt", {
        name: "Target Reminder | Enable Target Selection Prompt",
        hint: "When rolling an attack during combat with no target selected, prompt to select a target.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("foundry-target-reminder", "autoRollDamage", {
        name: "Target Reminder | Enable Auto-Roll Damage",
        hint: "Automatically roll damage when an attack roll is a success or critical success.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("foundry-target-reminder", "autoClearTargets", {
        name: "Target Reminder | Enable Auto-Clear Targets",
        hint: "Automatically clear target selections after rolling damage.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });
});

Hooks.once("ready", () => {
    if (game.system.id !== "pf2e") {
        console.warn("Target Reminder | This module is designed for Pathfinder 2e.");
        return;
    }

    if (game.pf2e && game.pf2e.Check) {
        const originalRoll = game.pf2e.Check.roll;

        game.pf2e.Check.roll = async function (check, context = {}, event, callback) {
            try {
                const isAttack = context.type && (context.type.includes("attack"));
                const hasTargets = game.user.targets.size > 0;
                const autoTargetPromptEnabled = game.settings.get("foundry-target-reminder", "autoTargetPrompt");

                if (isAttack && !hasTargets && game.combat?.active && autoTargetPromptEnabled) {
                    const combatants = game.combat.turns.filter(c => c.token && c.visible && !c.defeated && !c.actor?.isOwner);
                    if (combatants.length > 0) {
                        const selectedToken = await promptTargetSelection(combatants);
                        if (selectedToken) {
                            // 1. Set User Target (Visual)
                            selectedToken.setTarget(true, { user: game.user, releaseOthers: true });

                            // 2. CRITICAL FIX: Inject Target into Roll Context
                            const attackerTokenDoc = context.token;
                            const attackerToken = attackerTokenDoc?.object || canvas.tokens.controlled[0];
                            const distance = (attackerToken && selectedToken)
                                ? (canvas.grid.measurePath([attackerToken.center, selectedToken.center])?.distance || 0)
                                : 0;

                            context.target = {
                                actor: selectedToken.actor,
                                token: selectedToken.document,
                                distance: distance
                            };

                            // Ensure options exist
                            if (!context.options) context.options = [];

                            // PF2e uses specific option tags for targeting
                            context.options.push(`target:token:${selectedToken.id}`);
                            if (selectedToken.actor) {
                                context.options.push(`target:actor:${selectedToken.actor.uuid}`);
                            }

                            console.log("Target Reminder | Injected target into context:", selectedToken.name);
                        }
                    }
                }
            } catch (err) {
                console.error("Target Reminder | Error in roll interception:", err);
            }

            // Proceed with original roll
            const result = await originalRoll.apply(this, [check, context, event, callback]);

            // Auto-Roll Damage Logic
            try {
                const autoRollDamageEnabled = game.settings.get("foundry-target-reminder", "autoRollDamage");
                const message = Array.isArray(result) ? result[0] : result;

                if (message && context.item && autoRollDamageEnabled) {
                    const outcome = message.flags?.pf2e?.context?.outcome;
                    if (outcome === "success" || outcome === "criticalSuccess") {
                        console.log("Target Reminder | Auto-rolling damage...");
                        setTimeout(async () => {
                            if (context.item.rollDamage) {
                                await context.item.rollDamage({});
                                console.log("Target Reminder | Auto-rolled damage complete.");
                            }
                        }, 500);
                    }
                }
            } catch (err) {
                console.error("Target Reminder | Error in auto-damage roll:", err);
            }

            return result;
        };
        console.log("Target Reminder | Hooked game.pf2e.Check.roll");
    }
});

async function promptTargetSelection(combatants) {
    let optionsHtml = "";
    combatants.forEach(c => {
        optionsHtml += `<div style="display: flex; align-items: center; margin-bottom: 5px;">
            <img src="${c.img}" width="36" height="36" style="margin-right: 10px; border: 1px solid #000; flex-shrink: 0; object-fit: cover;"/>
            <input type="radio" name="target-selection" value="${c.tokenId}" id="target-${c.id}">
            <label for="target-${c.id}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</label>
        </div>`;
    });

    const tokenId = await foundry.applications.api.DialogV2.wait({
        window: { title: "Select Target" },
        content: `<form><p>No target selected. Who are you attacking?</p>
            <div class="target-list" style="max-height: 300px; overflow-y: auto;">${optionsHtml}</div></form>`,
        buttons: [{
            action: "select",
            icon: "fas fa-crosshairs",
            label: "Target Selected",
            callback: (event, button) => {
                const checked = button.form.querySelector('input[name="target-selection"]:checked');
                return checked ? checked.value : null;
            }
        }, {
            action: "cancel",
            icon: "fas fa-times",
            label: "Roll Without Target",
            callback: () => null
        }],
        rejectClose: false
    });

    return tokenId ? canvas.tokens.get(tokenId) : null;
}

// Robust Target Cleanup
Hooks.on("createChatMessage", (message) => {
    // Check if the message is from the current user
    if (message.author.id !== game.user.id) return;

    // Use a small delay to allow system processing to finish
    setTimeout(() => {
        const pf2eContext = message.flags?.pf2e?.context;

        let isDamage = false;

        // 1. Check Flags (Most reliable for PF2e)
        if (pf2eContext && (pf2eContext.type === "damage-roll" || pf2eContext.type === "spell-damage-roll")) {
            isDamage = true;
        }

        // 2. Check Rolls Array (Fallback)
        if (!isDamage && message.rolls && message.rolls.length > 0) {
            isDamage = message.rolls.some(r => r.constructor.name.includes("Damage"));
        }

        // 3. Check Flavor Text (Last Resort)
        if (!isDamage && message.flavor && message.flavor.includes("Damage")) {
            isDamage = true;
        }

        const autoClearTargetsEnabled = game.settings.get("foundry-target-reminder", "autoClearTargets");
        if (isDamage && autoClearTargetsEnabled) {
            console.log("Target Reminder | Cleanup Hook: Detected Damage Roll. Clearing targets.");
            game.user.updateTokenTargets([]);
        }
    }, 250);
});
