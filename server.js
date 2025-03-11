/* eslint-disable */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());


// 📌 Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).then(() => console.log("✅ Connecté à MongoDB"))
    .catch(err => console.error("❌ Erreur de connexion MongoDB :", err));

// 📌 Modèles MongoDB
const utilisateurSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['utilisateur', 'pharmacien', 'admin'], required: true },
    telephone: String,
    validé: { type: Boolean, default: function() { return this.role === 'utilisateur'; } },
    pharmacieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacie' } // 🔗 Lien vers la pharmacie
});
const Utilisateur = mongoose.model('Utilisateur', utilisateurSchema);

const pharmacieSchema = new mongoose.Schema({
    nom: { type: String, required: true },
    adresse: { type: String, required: true },
    latitude: Number, // 📌 Réintégration de la localisation
    longitude: Number // 📌 Réintégration de la localisation
});
const Pharmacie = mongoose.model('Pharmacie', pharmacieSchema);

const medicamentSchema = new mongoose.Schema({
    nom: { type: String, required: true },
    prix: { type: Number, required: true },
    quantite: { type: Number, required: true },
    description: String,
    datePoste: { type: Date, default: Date.now },
    pharmacienId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur', required: true },
    pharmacieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacie' } // 📌 Ajout de la pharmacie associée
});
const Medicament = mongoose.model('Medicament', medicamentSchema);

// 📌 Inscription
app.post('/inscription', async(req, res) => {
    try {
        const { email, password, role, telephone, pharmacieId } = req.body;
        if (!email || !password || !role) {
            return res.status(400).json({ message: "Tous les champs requis." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new Utilisateur({ email, password: hashedPassword, role, telephone, pharmacieId });
        await newUser.save();
        res.status(201).json({ message: "Inscription réussie, en attente de validation si pharmacien." });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de l'inscription", erreur: error.message });
    }
});

// 📌 Validation par admin
app.put('/valider/:id', async(req, res) => {
    try {
        await Utilisateur.findByIdAndUpdate(req.params.id, { validé: true });
        res.json({ message: "Compte validé avec succès !" });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la validation", erreur: error.message });
    }
});
// 📌 Récupérer la liste des utilisateurs (pour l'admin)
app.get('/utilisateurs', async(req, res) => {
    try {
        const utilisateurs = await Utilisateur.find({}, 'email role validé telephone');
        res.json(utilisateurs);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération des utilisateurs", erreur: error.message });
    }
});


// 📌 Connexion
app.post('/connexion', async(req, res) => {
    try {
        const { email, password } = req.body;
        const user = await Utilisateur.findOne({ email });

        if (!user || !user.validé) {
            return res.status(401).json({ message: "Compte non valide ou en attente de validation." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Mot de passe incorrect." });

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la connexion", erreur: error.message });
    }
});

// 📌 Middleware d'authentification
const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: "Accès refusé, token manquant." });

    try {
        const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
        req.userId = decoded.id;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        res.status(401).json({ message: "Token invalide." });
    }
};

// 📌 Médicaments (Ajout, Modification, Suppression, Recherche)
app.get('/medicaments', async(req, res) => {
    try {
        let { nom, maxprix, latitude, longitude } = req.query;
        let filtre = {};

        if (nom) filtre.nom = { $regex: new RegExp(nom, 'i') };
        if (maxprix) filtre.prix = { $lte: Number(maxprix) };

        // 📌 Récupérer les médicaments avec leurs pharmaciens et pharmacies
        let medicaments = await Medicament.find(filtre)
            .populate('pharmacienId', 'email telephone')
            .populate('pharmacieId', 'nom adresse latitude longitude');

        // 📌 Si l'utilisateur envoie sa localisation, ajouter la distance
        if (latitude && longitude) {
            latitude = parseFloat(latitude);
            longitude = parseFloat(longitude);

            medicaments = medicaments.map(med => {
                if (med.pharmacieId) {
                    const distance = getDistance(latitude, longitude, med.pharmacieId.latitude, med.pharmacieId.longitude);
                    return {...med.toObject(), distance };
                }
                return med.toObject();
            });

            // 📌 Trier les médicaments du plus proche au plus éloigné
            medicaments.sort((a, b) => a.distance - b.distance);
        }

        res.json(medicaments);

    } catch (error) {
        res.status(500).json({ message: "Erreur interne", erreur: error.message });
    }
});


app.post('/medicaments', authMiddleware, async(req, res) => {
    if (req.userRole !== 'pharmacien') return res.status(403).json({ message: "Accès refusé." });

    try {
        const { nom, prix, quantite, description, pharmacieId } = req.body;
        const newMedicament = new Medicament({
            nom,
            prix,
            quantite,
            description,
            pharmacienId: req.userId,
            pharmacieId // 📌 Associer le médicament à une pharmacie
        });

        await newMedicament.save();
        res.status(201).json({ message: "Médicament ajouté avec succès !" });

    } catch (error) {
        res.status(500).json({ message: "Erreur lors de l'ajout", erreur: error.message });
    }
});


app.put('/medicaments/:id', authMiddleware, async(req, res) => {
    try {
        const medicament = await Medicament.findById(req.params.id);
        if (!medicament || medicament.pharmacienId.toString() !== req.userId) {
            return res.status(403).json({ message: "Action non autorisée." });
        }

        await Medicament.findByIdAndUpdate(req.params.id, req.body);
        res.json({ message: "Médicament modifié !" });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la modification" });
    }
});

app.delete('/medicaments/:id', authMiddleware, async(req, res) => {
    try {
        const medicament = await Medicament.findById(req.params.id);
        if (!medicament || medicament.pharmacienId.toString() !== req.userId) {
            return res.status(403).json({ message: "Action non autorisée." });
        }

        await Medicament.findByIdAndDelete(req.params.id);
        res.json({ message: "Médicament supprimé !" });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la suppression" });
    }
});
// Chatbot IA (Mistral AI)
app.post('/chatbot', async(req, res) => {
    try {
        const { question } = req.body;

        if (!question) {
            return res.status(400).json({ message: "La question est requise" });
        }

        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: "mistral-tiny",
            messages: [{ role: "user", content: question }]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // ❌ Supprimé : récupération de la réponse de l'IA
        //const aiResponse = response.data.choices ? .[0] ? .message ? .content || "L'IA n'a pas fourni de réponse.";

        // ✅ Envoi directement toute la réponse de l'IA

        res.json(response.data);

    } catch (error) {
        console.error("Erreur avec l'IA :", error.response ? error.response.data || error.message : error.message);
        res.status(500).json({
            message: "Erreur avec l'IA",
            erreur: error.response ? error.response.data || error.message : error.message
        });
    }
});

// 📌 Localisation des pharmacies
app.get('/pharmacies', async(req, res) => {
    try {
        res.json(await Pharmacie.find());
    } catch (error) {
        res.status(500).json({ message: "Erreur interne" });
    }
});
app.post('/pharmacies', async(req, res) => {
    try {
        const { nom, adresse, latitude, longitude } = req.body;
        const nouvellePharmacie = new Pharmacie({ nom, adresse, latitude, longitude });
        await nouvellePharmacie.save();
        res.status(201).json(nouvellePharmacie);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de l'ajout de la pharmacie", erreur: error.message });
    }
});

// 📌 Fonction pour calculer la distance entre deux points GPS (en km)
function getDistance(lat1, lon1, lat2, lon2) {
    function toRad(Value) {
        return Value * Math.PI / 180;
    }

    const R = 6371; // Rayon de la Terre en km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance en km
}
// 📌 Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`));