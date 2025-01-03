const fs = require('fs');
const path = require('path');
const os = require('os');
const { Mogu } = require("@scobru/mogu");

require('dotenv').config();

async function cleanRadata() {
    try {
        // Path corretto di radata
        const radataPath = path.join(process.cwd(), "radata");

        console.log('🔍 Cerco radata in:', radataPath);

        if (fs.existsSync(radataPath)) {
            // Inizializza Mogu con la nuova configurazione
            const mogu = new Mogu({
                storageService: 'PINATA',
                storageConfig: {
                    apiKey: process.env.PINATA_API_KEY || '',
                    apiSecret: process.env.PINATA_API_SECRET || ''
                }
            });

            // Backup su IPFS prima della pulizia
            console.log('📦 Creazione backup su IPFS...');
            const hash = await mogu.backup();
            if (hash) {
                console.log('✅ Backup IPFS creato con hash:', hash);
            }

            // Elimina il contenuto mantenendo la struttura
            const files = fs.readdirSync(radataPath);
            for (const file of files) {
                const filePath = path.join(radataPath, file);
                if (fs.statSync(filePath).isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                    fs.mkdirSync(filePath);
                } else {
                    fs.unlinkSync(filePath);
                }
            }
            
            console.log('🧹 Radata pulito mantenendo la struttura delle directory');
            console.log('💾 Per ripristinare il backup, usa: npm run restore:radata');
            console.log('🔑 Hash IPFS per il ripristino:', hash);
        } else {
            console.log('⚠️ Directory radata non trovata');
        }
    } catch (error) {
        console.error('❌ Errore durante la pulizia:', error);
        process.exit(1);
    }
}

cleanRadata();