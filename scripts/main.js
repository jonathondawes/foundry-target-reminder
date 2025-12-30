Hooks.once("init", () => {
    console.log("Target Reminder | Initializing module");
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

                if (isAttack && !hasTargets && game.combat?.active) {
                    const combatants = game.combat.turns.filter(c => c.token && c.visible && !c.defeated);
                    if (combatants.length > 0) {
                        const selectedToken = await promptTargetSelection(combatants);
                        if (selectedToken) {
                            // 1. Set User Target (Visual)
                            selectedToken.setTarget(true, { user: game.user, releaseOthers: true });

                            // 2. CRITICAL FIX: Inject Target into Roll Context
                            // Only setting user target is not enough for the current function call context
                            context.target = selectedToken.actor;
                            if (!context.token) context.token = selectedToken;

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
                const message = Array.isArray(result) ? result[0] : result;

                if (message && context.item) {
                    const outcome = message.flags?.pf2e?.context?.outcome;
                    if (outcome === "success" || outcome === "criticalSuccess") {
                        console.log("Target Reminder | Auto-rolling damage...");
                        setTimeout(async () => {
                            if (context.item.rollDamage) {
                                // Pass the event and ensure the item knows about the target (if needed)
                                await context.item.rollDamage({ event });

                                // Explicit cleanup after auto-roll
                                console.log("Target Reminder | Auto-rolled damage complete. Clearing targets.");
                                if (game.user.targets.size > 0) {
                                    game.user.updateTokenTargets([]);
                                }
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
    return new Promise((resolve) => {
        let options = "";
        combatants.forEach(c => {
            options += `<div class="form-group flexrow" style="align-items: center; margin-bottom: 5px;">
                <img src="${c.img}" width="36" height="36" style="margin-right: 10px; border: 1px solid #000; flex-shrink: 0; object-fit: cover;"/>
                <input type="radio" name="target-selection" value="${c.tokenId}" id="target-${c.id}">
                <label for="target-${c.id}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</label>
            </div>`;
        });

        new Dialog({
            title: "Select Target",
            content: `<form><p>No target selected. Who are you attacking?</p><div class="target-list" style="max-height: 300px; overflow-y: auto;">${options}</div></form>`,
            buttons: {
                select: {
                    icon: '<i class="fas fa-crosshairs"></i>',
                    label: "Target Selected",
                    callback: (html) => {
                        const tokenId = html.find('input[name="target-selection"]:checked').val();
                        resolve(tokenId ? canvas.tokens.get(tokenId) : null);
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Roll Without Target",
                    callback: () => resolve(null)
                }
            },
            default: "select",
            close: () => resolve(null)
        }).render(true);
    });
}

// Robust Target Cleanup
Hooks.on("createChatMessage", (message) => {
    // Check if the message is from the current user
    if (message.user.id !== game.user.id) return;

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

        if (isDamage) {
            console.log("Target Reminder | Cleanup Hook: Detected Damage Roll. Clearing targets.");
            game.user.updateTokenTargets([]);
        }
    }, 250);
});
