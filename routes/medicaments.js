const express = require('express');
const router = express.Router();

// 📌 Route GET pour récupérer tous les médicaments
router.get('/', (req, res) => {
    res.json({ message: "Liste des médicaments" });
});

module.exports = router;