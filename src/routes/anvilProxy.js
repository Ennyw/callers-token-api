"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const router = express_1.default.Router();
const ANVIL_API_KEY = process.env.ANVIL_API_KEY || "zSvXJmOTfq7fx7MTQeckI5G35lJKpRtianHHVLCF";
const ANVIL_BASE_URL = 'https://prod.api.ada-anvil.app';
// Get UTXOs for an address
router.get('/utxos', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { address } = req.query;
        if (!address) {
            return res.status(400).json({ error: 'Address is required' });
        }
        const response = yield axios_1.default.get(`${ANVIL_BASE_URL}/wallet/utxos/${address}`, {
            headers: {
                'x-api-key': ANVIL_API_KEY
            }
        });
        res.json(((_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b.data) || {});
    }
    catch (error) {
        console.error('Error fetching UTXOs:', error);
        res.status(500).json({ error: 'Failed to fetch UTXOs' });
    }
}));
// Create transaction
router.post('/transaction', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { changeAddress, utxos, outputs } = req.body;
        if (!changeAddress || !utxos || !outputs) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        const response = yield axios_1.default.post(`${ANVIL_BASE_URL}/wallet/transaction`, {
            changeAddress,
            utxos,
            outputs
        }, {
            headers: {
                'x-api-key': ANVIL_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        res.json(((_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b.data) || {});
    }
    catch (error) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
}));
// Submit transaction
router.post('/submit', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { transaction } = req.body;
        if (!transaction) {
            return res.status(400).json({ error: 'Transaction is required' });
        }
        const response = yield axios_1.default.post(`${ANVIL_BASE_URL}/marketplace/api/submit`, {
            transaction
        }, {
            headers: {
                'x-api-key': ANVIL_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data || {});
    }
    catch (error) {
        console.error('Error submitting transaction:', error);
        res.status(500).json({ error: 'Failed to submit transaction' });
    }
}));
exports.default = router;
const router = express_1.default.Router();
const ANVIL_API_KEY = process.env.ANVIL_API_KEY || "zSvXJmOTfq7fx7MTQeckI5G35lJKpRtianHHVLCF";
const ANVIL_BASE_URL = 'https://prod.api.ada-anvil.app';
// Get UTXOs for an address
router.get('/utxos', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { address } = req.query;
        if (!address) {
            return res.status(400).json({ error: 'Address is required' });
        }
        const response = yield axios_1.default.get(`${ANVIL_BASE_URL}/wallet/utxos/${address}`, {
            headers: {
                'x-api-key': ANVIL_API_KEY
            }
        });
        res.json(((_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b.data) || {});
    }
    catch (error) {
        console.error('Error fetching UTXOs:', error);
        res.status(500).json({ error: 'Failed to fetch UTXOs' });
    }
}));
// Create transaction
router.post('/transaction', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { changeAddress, utxos, outputs } = req.body;
        if (!changeAddress || !utxos || !outputs) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        const response = yield axios_1.default.post(`${ANVIL_BASE_URL}/wallet/transaction`, {
            changeAddress,
            utxos,
            outputs
        }, {
            headers: {
                'x-api-key': ANVIL_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        res.json(((_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b.data) || {});
    }
    catch (error) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
}));
// Submit transaction
router.post('/submit', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { transaction } = req.body;
        if (!transaction) {
            return res.status(400).json({ error: 'Transaction is required' });
        }
        const response = yield axios_1.default.post(`${ANVIL_BASE_URL}/marketplace/api/submit`, {
            transaction
        }, {
            headers: {
                'x-api-key': ANVIL_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data || {});
    }
    catch (error) {
        console.error('Error submitting transaction:', error);
        res.status(500).json({ error: 'Failed to submit transaction' });
    }
}));
exports.default = router;
