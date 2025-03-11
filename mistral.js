require('dotenv').config();
const axios = require('axios');

const mistralChatbot = async(question) => {
    try {
        if (!question) {
            throw new Error("La question est requise");
        }

        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: "mistral-tiny", // ✅ Vérifie que le modèle existe bien
            messages: [{ role: "user", content: question }]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
                'Content-Type': 'application/json' // ✅ Ajout du bon header
            }
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error("Erreur avec l'IA :", error.response ? error.response.data : error.message);
        throw new Error("Erreur avec l'IA. Veuillez réessayer plus tard.");
    }
};

module.exports = mistralChatbot;