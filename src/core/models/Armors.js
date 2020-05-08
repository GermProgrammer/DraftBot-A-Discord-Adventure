module.exports = (sequelize, DataTypes) => {

  const Armors = sequelize.define('Armors', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    rarity: {
      type: DataTypes.INTEGER,
      defaultValue: JsonReader.models.armors.rarity
    },
    rawAttack: {
      type: DataTypes.INTEGER,
      defaultValue: JsonReader.models.armors.rawAttack
    },
    rawDefense: {
      type: DataTypes.INTEGER,
      defaultValue: JsonReader.models.armors.rawDefense
    },
    rawSpeed: {
      type: DataTypes.INTEGER,
      defaultValue: JsonReader.models.armors.rawSpeed
    },
    attack: {
      type: DataTypes.INTEGER,
      defaultValue: JsonReader.models.armors.attack
    },
    defense: {
      type: DataTypes.INTEGER,
      defaultValue: JsonReader.models.armors.defense
    },
    speed: {
      type: DataTypes.INTEGER,
      defaultValue: JsonReader.models.armors.speed
    },
    fr: {
      type: DataTypes.TEXT
    },
    en: {
      type: DataTypes.TEXT
    }
  }, {
    tableName: 'armors',
    freezeTableName: true
  });

  return Armors;
};