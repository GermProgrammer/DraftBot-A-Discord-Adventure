/**
 * @param entity
 * @param {Number} attack
 * @param {Number} defense
 * @param {Number} speed
 * @param {Number} power
 * @param {Number} maxDefenseImprovement
 * @param {Number} maxSpeedImprovement
 */
class Fighter {

    /**
     * @param entity
     */
    constructor(entity) {
        this.entity = entity;
    }

    /**
     * Calculate all the stats of a fighter. Must be done outside of the constructor because of asynchronicity
     * @return {Promise<void>}
     */
    async calculateStats() {
        let inv = this.entity.Player.Inventory;
        let w = await inv.getWeapon();
        let a = await inv.getArmor();
        let p = await inv.getPotion();
        let o = await inv.getActiveObject();
        this.attack = this.entity.getCumulativeAttack(w, a, p, o);
        this.defense = this.entity.getCumulativeDefense(w, a, p, o);
        this.speed = this.entity.getCumulativeSpeed(w, a, p, o);
        this.power = this.entity.getCumulativeHealth(this.entity.Player);
        this.maxDefenseImprovement = FIGHT.MAX_DEFENSE_IMPROVEMENT;
        this.maxSpeedImprovement = FIGHT.MAX_SPEED_IMPROVEMENT;
    }

    /**
     * Drink the potion if it is a fight potion
     */
    async consumePotionIfNeeded() {
        if ((await this.entity.Player.Inventory.getPotion()).isFightPotion()) {
            this.entity.Player.Inventory.drinkPotion();
            this.entity.Player.save();
        }
    }

    /**
     * Improve defense of the fighter and update max improvement
     * @return {number} Added defense
     */
    improveDefense() {
        this.maxDefenseImprovement += randInt(0, Math.round(this.maxDefenseImprovement / 2));
        this.defense += this.maxDefenseImprovement;
        let r = this.maxDefenseImprovement;
        this.maxDefenseImprovement = Math.floor(this.maxDefenseImprovement * 0.5);
        return r;
    }

    /**
     * Improve speed of the fighter and update max improvement
     * @return {number} Added speed
     */
    improveSpeed() {
        this.maxSpeedImprovement += randInt(0, Math.round(this.maxSpeedImprovement / 2));
        this.speed += this.maxSpeedImprovement;
        let r = this.maxSpeedImprovement;
        this.maxSpeedImprovement = Math.floor(this.maxSpeedImprovement * 0.5);
        return r;
    }
}

/**
 * @param {Number} damage
 * @param {Number} defenseImprovement
 * @param {Number} speedImprovement
 * @param {Boolean} fullSuccess
 */
class FightActionResult {

    constructor() {
        this.damage = 0;
        this.defenseImprovement = 0;
        this.speedImprovement = 0;
        this.fullSuccess = false;
    }
}

/**
 * @param {Fighter[]} fighters
 * @param {Number} turn
 * @param {module:"discord.js".Message} message
 * @param {("fr"|"en")} language
 * @param {module:"discord.js".Message} lastSummary
 * @param {Number} elo
 * @param {Number} points
 */
class Fight {

    /**
     *
     * @param player1
     * @param player2
     * @param {module:"discord.js".Message} message
     * @param {("fr"|"en")} language - Language to use in the response
     * @returns {Promise<void>}
     */
    constructor(player1, player2, message, language) {
        this.fighters = [new Fighter(player1), new Fighter(player2)];
        this.turn = 0;
        this.message = message;
        this.language = language;
        this.lastSummary = undefined;
    }

    /********************************************************** EXTERNAL MECHANICS FUNCTIONS **********************************************************/

    /**
     * Starts the fight. Is not called automatically. Also calculates stats, consume potions, block players and proceed to next turn.
     * @return {Promise<void>}
     */
    async startFight() {
        if (this.hasStarted()) {
            throw new Error("The fight already started !");
        } else if (this.hasEnded()) {
            throw new Error("The fight cannot be started twice !");
        }
        for (let i = 0; i < this.fighters.length; i++) {
            await this.fighters[i].calculateStats();
            await this.fighters[i].consumePotionIfNeeded();
            global.addBlockedPlayer(this.fighters[i].entity.discordUser_id, "fight");
        }
        this.introduceFight();
        await this.nextTurn();
    };

    /********************************************************** MESSAGE RELATED FUNCTIONS **********************************************************/

    /**
     * Send the fight intro message
     */
    introduceFight() {
        this.message.channel.send(format(JsonReader.commands.fight.getTranslation(this.language).intro, {
            player1: this.fighters[0].entity.getMention(),
            player2: this.fighters[1].entity.getMention()
        }));
    }

    /**
     * Send the fight outro message
     */
    outroFight() {
        let loser = this.getLoser();
        if (loser != null) {
            this.message.channel.send(format(JsonReader.commands.fight.getTranslation(this.language).end.win, {
                winner: this.getWinner().entity.getMention(),
                loser: loser.entity.getMention(),
                elo: this.elo,
                points: this.points
            }));
        } else {
            this.message.channel.send(format(JsonReader.commands.fight.getTranslation(this.language).end.draw, {
                player1: this.fighters[0].entity.getMention(),
                player2: this.fighters[1].entity.getMention()
            }));
        }
    }

    /**
     * Send the turn indications in order to choose an action
     * @return {Promise<void>}
     */
    async sendTurnIndications() {

        let playingId = this.getPlayingFighter().entity.discordUser_id;
        let fight = this;
        let currentTurn = this.turn;

        this.message.channel.send(format(JsonReader.commands.fight.getTranslation(this.language).turnIndications, {
            pseudo: await this.getPlayingFighter().entity.getMention(),
        }))
            .then(async function (message) {
                await message.react("⚔");
                await message.react("🗡");
                await message.react("💣");
                await message.react("🛡");
                await message.react("🚀");

                const filter = (reaction, user) => {
                    return user.id === playingId;
                };

                const collector = message.createReactionCollector(filter, {time: 30000});

                collector.on('collect', async (reaction) => {
                    switch (reaction.emoji.name) {
                        case "⚔":
                            await fight.useAction(FIGHT.ACTION.SIMPLE_ATTACK);
                            break;
                        case "🗡":
                            await fight.useAction(FIGHT.ACTION.QUICK_ATTACK);
                            break;
                        case "💣":
                            await fight.useAction(FIGHT.ACTION.POWERFUL_ATTACK);
                            break;
                        case "🛡":
                            await fight.useAction(FIGHT.ACTION.IMPROVE_DEFENSE);
                            break;
                        case "🚀":
                            await fight.useAction(FIGHT.ACTION.IMPROVE_SPEED);
                            break;
                        default:
                            return;
                    }
                    message.delete().catch();
                });

                collector.on('end', () => {
                    if (currentTurn === fight.getTurn()) {
                        message.delete().catch();
                        fight.getPlayingFighter().power = 0;
                        fight.endFight();
                    }
                });
            });
    }

    /**
     * Summarize the fight
     * @return {Promise<void>}
     */
    async summarizeFight() {
        let attacker = this.getPlayingFighter();
        let defender = this.getDefendingFighter();
        let fight = this;

        if (this.lastSummary !== undefined) {
            this.lastSummary.delete({timeout: 5000}).catch();
        }

        this.message.channel.send(
            JsonReader.commands.fight.getTranslation(this.language).summarize.intro +
            format(JsonReader.commands.fight.getTranslation(this.language).summarize.attacker, {pseudo: await attacker.entity.Player.getPseudo(this.language)}) +
            format(JsonReader.commands.fight.getTranslation(this.language).summarize.stats, {
                power: attacker.power,
                attack: attacker.attack,
                defense: attacker.defense,
                speed: attacker.speed
            }) +
            format(JsonReader.commands.fight.getTranslation(this.language).summarize.defender, {pseudo: await defender.entity.Player.getPseudo(this.language)}) +
            format(JsonReader.commands.fight.getTranslation(this.language).summarize.stats, {
                power: defender.power,
                attack: defender.attack,
                defense: defender.defense,
                speed: defender.speed
            })
        ).then(message => {
            fight.lastSummary = message;
        });
    }

    /**
     * Send the result of the action
     * @param {FIGHT.ACTION} action
     * @param {FightActionResult} fightActionResult
     * @return {Promise<void>}
     */
    async sendActionMessage(action, fightActionResult) {
        let msg = format(JsonReader.commands.fight.getTranslation(this.language).actions.intro, {player: await this.getPlayingFighter().entity.Player.getPseudo(this.language)});
        let section;
        switch (action) {
            case FIGHT.ACTION.IMPROVE_DEFENSE:
                await this.message.channel.send(format(msg + JsonReader.commands.fight.getTranslation(this.language).actions.defense, {defense: fightActionResult.defenseImprovement}));
                return;
            case FIGHT.ACTION.IMPROVE_SPEED:
                await this.message.channel.send(format(msg + JsonReader.commands.fight.getTranslation(this.language).actions.speed, {speed: fightActionResult.speedImprovement}));
                return;
            case FIGHT.ACTION.POWERFUL_ATTACK:
                section = JsonReader.commands.fight.getTranslation(this.language).actions.powerful;
                break;
            case FIGHT.ACTION.QUICK_ATTACK:
                section = JsonReader.commands.fight.getTranslation(this.language).actions.quick;
                break;
            case FIGHT.ACTION.SIMPLE_ATTACK:
                section = JsonReader.commands.fight.getTranslation(this.language).actions.simple;
                break;
            default:
                return;
        }
        if (fightActionResult.damage === 0) {
            section = section.failed;
        }
        else if (fightActionResult.fullSuccess) {
            section = section.succeed;
        }
        else {
            section = section.notGood;
        }
        msg += section[randInt(0, section.length - 1)];
        await this.message.channel.send(msg + format(JsonReader.commands.fight.getTranslation(this.language).actions.damages, { damages : fightActionResult.damage }));
    }

    /********************************************************** INTERNAL MECHANICS FUNCTIONS **********************************************************/

    /**
     * Proceed to next turn or end the fight if there is a loser or the max turn is reached
     * @return {Promise<void>}
     */
    async nextTurn() {
        this.turn++;
        if (this.getLoser() != null || this.turn >= FIGHT.MAX_TURNS) {
            this.endFight();
            return;
        }
        await this.summarizeFight();
        await this.sendTurnIndications();
    }

    /**
     * End the fight. Change fighters' score if there is a loser and unblock players
     */
    endFight() {
        if (!this.hasStarted()) {
            throw new Error("The fight has not started yet !");
        } else if (this.hasEnded()) {
            throw new Error("The fight already ended !");
        }
        let loser = this.getLoser();
        if (loser != null) {
            this.calculateElo();
            this.calculatePoints();
            loser.entity.Player.addScore(-this.points);
            loser.entity.Player.save();
            let winner = this.getWinner();
            winner.entity.Player.addScore(this.points);
            winner.entity.Player.save();
        }
        for (let i = 0; i < this.fighters.length; i++) {
            global.removeBlockedPlayer(this.fighters[i].entity.discordUser_id);
        }
        if (this.lastSummary !== undefined) {
            this.lastSummary.delete({timeout: 5000}).catch();
        }
        this.outroFight();
        this.turn = -1;
    }

    /**
     * Makes the playing fighter use an action
     * @param {FIGHT.ACTION} action
     * @return {Promise<void>}
     */
    async useAction(action) {

        let success = Math.random();
        let attacker = this.getPlayingFighter();
        let defender = this.getDefendingFighter();
        let far = new FightActionResult();
        let powerChanger;

        switch (action) {
            case FIGHT.ACTION.QUICK_ATTACK:
                powerChanger = 0.1;
                if (defender.speed > attacker.speed && success < 0.3) {
                    powerChanger = 0.8;
                } else if (defender.speed < attacker.speed && success < 0.95) {
                    powerChanger = 0.85;
                }
                far.damage = Math.round(attacker.attack * powerChanger - Math.round(defender.defense * 0.5));
                far.fullSuccess = far.damage >= attacker.attack - defender.power;
                break;

            case FIGHT.ACTION.SIMPLE_ATTACK:
                powerChanger = 0.1;
                if ((defender.speed > attacker.speed && success <= 0.6) || (defender.speed < attacker.speed && success < 0.8)) {
                    powerChanger = 1.0;
                } else if ((defender.speed > attacker.speed && success <= 0.9)) {
                    powerChanger = 0.5;
                }
                far.damage = Math.round(attacker.attack * powerChanger - Math.round(defender.defense * 0.85));
                far.fullSuccess = far.damage >= 100;
                break;

            case FIGHT.ACTION.POWERFUL_ATTACK:
                powerChanger = 0.0;
                if ((defender.speed > attacker.speed && success <= 0.05) || (defender.speed < attacker.speed && success < 0.4)) {
                    powerChanger = 1.25;
                } else if ((defender.speed > attacker.speed && success <= 0.4) || (defender.speed < attacker.speed && success < 0.7)) {
                    powerChanger = 2.0;
                }
                if (powerChanger > 1) {
                    attacker.speed = Math.round(attacker.speed * 0.75);
                }
                else {
                    attacker.speed = Math.round(attacker.speed * 0.9);
                }
                far.damage = Math.round(attacker.attack * powerChanger - Math.round(defender.defense * 0.5));
                far.fullSuccess = powerChanger === 2;
                break;

            case FIGHT.ACTION.IMPROVE_DEFENSE:
                far.defenseImprovement = attacker.improveDefense();
                break;

            case FIGHT.ACTION.IMPROVE_SPEED:
                far.speedImprovement = attacker.improveSpeed();
                break;

            default:
                return;
        }
        if (far.damage > 0) {
            defender.power -= far.damage;
            if (defender.power < 0) {
                defender.power = 0;
            }
        }
        else {
            far.damage = 0;
        }
        await this.sendActionMessage(action, far);
        await this.nextTurn();
    }


    /**
     * Calculate elo of the fight and set the attribute elo
     */
    calculateElo() {
        let loser = this.getLoser();
        let winner = this.getWinner();
        if (loser !== null && winner !== null && winner.entity.Player.score !== 0) {
            this.elo = Math.round((loser.entity.Player.score / winner.entity.Player.score) * 100) / 100;
        } else {
            this.elo = 0;
        }
    }

    /**
     * Calculate points of the fight based on elo and set the attribute points
     */
    calculatePoints() {
        let loser = this.getLoser();
        if (loser !== null) {
            this.points = Math.round(100 + 10 * loser.entity.Player.level * this.elo);
            if (this.points > 2000) {
                this.points = Math.round(2000 - randInt(5, 1000));
            }
        } else {
            this.points = 0;
        }
    }

    /********************************************************** GETTERS **********************************************************/

    /**
     * @return {boolean}
     */
    hasStarted() {
        return this.turn !== 0;
    }

    /**
     * @return {boolean}
     */
    hasEnded() {
        return this.turn === -1;
    }

    /**
     * @return {boolean} If the fight is currently running
     */
    isRunning() {
        return this.hasStarted() && !this.hasEnded();
    }

    /**
     * Get the playing fighter or null if the fight is not running
     * @return {Fighter|null}
     */
    getPlayingFighter() {
        return this.isRunning() ? this.fighters[(this.turn - 1) % 2] : null;
    }

    /**
     * Get the defending fighter or null if the fight is not running
     * @return {Fighter|null}
     */
    getDefendingFighter() {
        return this.isRunning() ? this.fighters[this.turn % 2] : null;
    }

    /**
     * Get the loser of the fight or null if there is none
     * @return {null|Fighter}
     */
    getLoser() {
        for (let i = 0; i < this.fighters.length; ++i) {
            if (this.fighters[i].power <= 0) {
                return this.fighters[i];
            }
        }
        return null;
    }

    /**
     * Get the winner of the fight or null if there is none
     * @return {null|Fighter}
     */
    getWinner() {
        let loser = this.getLoser();
        if (loser == null) {
            return null;
        }
        return loser === this.fighters[0] ? this.fighters[1] : this.fighters[0];
    }

    /**
     * @return {number}
     */
    getTurn() {
        return this.turn;
    }
}

module.exports = Fight;