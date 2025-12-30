Hooks.once("init", () => {
    console.log("Target Reminder | Initializing module");
});

Hooks.once("ready", () => {
    // Ensure we are in PF2e
    if (game.system.id !== "pf2e") {
        console.warn("Target Reminder | This module is designed for Pathfinder 2e.");
        return;
    }

    // Wrap the PF2e Check.roll function to intercept attack rolls
    if (game.pf2e && game.pf2e.Check) {
        const originalRoll = game.pf2e.Check.roll;

        // Monkey-patching the roll method
        game.pf2e.Check.roll = async function (check, context = {}, event, callback) {
            try {
                // Identify if this is an attack roll
                const isAttack = context.type && (context.type.includes("attack"));

                // Identify if we have targets
                const hasTargets = game.user.targets.size > 0;

                // Only interrupt if:
                // 1. It is an attack
                // 2. We have no targets
                // 3. We are in combat
                if (isAttack && !hasTargets && game.combat?.active) {
                    const combatants = game.combat.turns.filter(c => c.token && c.visible && !c.defeated);

                    if (combatants.length > 0) {
                        const selectedToken = await promptTargetSelection(combatants);
                        if (selectedToken) {
                            selectedToken.setTarget(true, { user: game.user, releaseOthers: true });
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
                // result is typically the ChatMessage (or array of them)
                const message = Array.isArray(result) ? result[0] : result;

                if (message && context.item) {
                    const outcome = message.flags?.pf2e?.context?.outcome;
                    if (outcome === "success" || outcome === "criticalSuccess") {
                        // Small delay to ensure chat renders comfortably
                        setTimeout(async () => {
                            if (context.item.rollDamage) {
                                await context.item.rollDamage({ event });

                                // Explicitly clear targets here for the auto-roll case
                                // This ensures it works even if the chat hook misses it
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
    } else {
        console.error("Target Reminder | Could not find game.pf2e.Check.roll to hook.");
    }
});

/**
 * Prompts the user to select a target from a list of combatants.
 */
async function promptTargetSelection(combatants) {
    return new Promise((resolve) => {
        let options = "";
        combatants.forEach(c => {
            const name = c.name;
            const img = c.img;
            options += `<div class="form-group flexrow" style="align-items: center; margin-bottom: 5px;">
                <img src="${img}" width="36" height="36" style="margin-right: 10px; border: 1px solid #000; flex-shrink: 0; object-fit: cover;"/>
                <input type="radio" name="target-selection" value="${c.tokenId}" id="target-${c.id}">
                <label for="target-${c.id}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</label>
            </div>`;
        });

        const content = `
            <form>
                <p>You have no target selected. Who are you attacking?</p>
                <div class="target-list" style="max-height: 300px; overflow-y: auto;">
                    ${options}
                </div>
            </form>
        `;

        new Dialog({
            title: "Select Target",
            content: content,
            buttons: {
                select: {
                    icon: '<i class="fas fa-crosshairs"></i>',
                    label: "Target Selected",
                    callback: (html) => {
                        const tokenId = html.find('input[name="target-selection"]:checked').val();
                        if (tokenId) {
                            const token = canvas.tokens.get(tokenId);
                            resolve(token ? token : null);
                        } else {
                            resolve(null);
                        }
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

// Target Cleanup: Deselect after damage has been rolled
Hooks.on("createChatMessage", (message) => {
    // Ensure it is our user creating the message
    if (!message.isAuthor) return;

    // Check PF2e flags
    const pf2eContext = message.flags?.pf2e?.context;

    // Check if it is a damage roll via flags
    let isDamage = pf2eContext && (pf2eContext.type === "damage-roll" || pf2eContext.type === "spell-damage-roll");

    // Fallback: Check Roll instances directly if flags aren't clear
    if (!isDamage && message.rolls && message.rolls.length > 0) {
        // Look for any roll that identifies as a DamageRoll
        isDamage = message.rolls.some(r => r.constructor.name.includes("Damage"));
    }

    if (isDamage) {
        // Clear targets
        game.user.updateTokenTargets([]);
    }
});
