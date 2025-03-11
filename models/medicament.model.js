const mongoose = require("mongoose");

// 📌 Définition du modèle "Médicament"
const medicamentSchema = new mongoose.Schema({
    nom: String,
    description: String,
    prix: Number
});

// 📌 Création du modèle basé sur le schéma
const Medicament = mongoose.model("Medicament", medicamentSchema);

// 📌 On exporte ce modèle pour l'utiliser ailleurs
module.exports = Medicament;