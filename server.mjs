import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';
import path from 'path';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Construct Helius RPC URL from env
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_URL, 'finalized');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

const imageFolder = path.join(process.cwd(), 'imagedata');

// List images
app.get('/list-images', (req, res) => {
  fs.readdir(imageFolder, (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Cannot read imagedata folder" });
    }
    const pngFiles = files.filter(file => file.toLowerCase().endsWith('.png'));
    console.log('[list-images]: Returning PNG files:', pngFiles);
    return res.json({ images: pngFiles });
  });
});

// Prepare IPFS metadata
app.post('/prepare-ipfs', async (req, res) => {
  const { name, symbol, imagename } = req.body;
  if (!name || !symbol || !imagename) {
    console.error('[prepare-ipfs]: Missing parameters', { name, symbol, imagename });
    return res.status(400).json({ message: "Missing name, symbol or imagename" });
  }

  console.log('[prepare-ipfs]: Received request with', { name, symbol, imagename });

  const form_data = {
    name,
    symbol,
    description: 'A memecoin created via PumpPortal and our custom MVP',
    twitter: 'https://x.com/',
    telegram: 'https://t.me/',
    website: 'https://pumpportal.fun',
    showName: 'true'
  };

  const imagePath = path.join(imageFolder, imagename);
  if (!fs.existsSync(imagePath)) {
    console.error('[prepare-ipfs]: Image not found on server:', imagePath);
    return res.status(400).json({ message: "Image not found on server" });
  }

  const form = new FormData();
  for (const key in form_data) {
    form.append(key, form_data[key]);
  }
  form.append('file', fs.createReadStream(imagePath), {
    filename: imagename,
    contentType: 'image/png'
  });

  let metadata_response;
  try {
    metadata_response = await fetch('https://pump.fun/api/ipfs', {
      method: 'POST',
      body: form
    });
  } catch (e) {
    console.error('Error uploading to IPFS:', e);
    return res.status(500).json({ message: "Error uploading to IPFS" });
  }

  if (!metadata_response.ok) {
    const errTxt = await metadata_response.text();
    console.error('IPFS Upload Error:', errTxt);
    return res.status(500).json({ message: "IPFS upload failed", details: errTxt });
  }

  const metadata_json = await metadata_response.json();
  const metadataUri = metadata_json.metadataUri;
  console.log('[prepare-ipfs]: Successfully got metadataUri:', metadataUri);

  return res.json({ metadataUri });
});

// Confirm creation in DB
app.post('/confirm-creation', async (req, res) => {
  const { submissionId, txSignature, mintAddress, memo } = req.body;
  console.log('[confirm-creation]: Received:', { submissionId, txSignature, mintAddress, memo });
  if (!submissionId || !txSignature || !mintAddress || !memo) {
    console.error('[confirm-creation]: Missing parameters');
    return res.status(400).json({message:"Missing parameters"});
  }

  const { error } = await supabase
    .from('submissions')
    .insert([{id: submissionId, memo, status:'active', token_mint:mintAddress, creation_tx:txSignature}]);

  if (error) {
    console.error('[confirm-creation]: DB insert error', error);
    return res.status(500).json({message:"DB insert error"});
  }

  console.log('[confirm-creation]: Meme is now active:', submissionId);
  return res.json({message:"Meme is now active"});
});

// Confirm upvote in DB
app.post('/confirm-upvote', async (req, res) => {
  const { submissionId, userPubKey, txSignature } = req.body;
  console.log('[confirm-upvote]: Received:', { submissionId, userPubKey, txSignature });
  if (!submissionId || !userPubKey || !txSignature) {
    console.error('[confirm-upvote]: Missing parameters');
    return res.status(400).json({message:"Missing parameters"});
  }

  const { error } = await supabase
    .from('upvotes')
    .insert([{submission_id: submissionId, user_pubkey:userPubKey, tx_sig:txSignature}]);

  if (error) {
    console.error('[confirm-upvote]: DB insert error', error);
    return res.status(500).json({message:"DB insert error"});
  }

  console.log('[confirm-upvote]: Upvote recorded for submission:', submissionId);
  return res.json({message:"Upvote recorded"});
});

// New endpoint: Get balance via backend (no direct RPC in frontend)
app.get('/balance', async (req, res) => {
  const { pubkey } = req.query;
  if (!pubkey) {
    return res.status(400).json({message:"Missing pubkey"});
  }
  try {
    const balanceLamports = await connection.getBalance(new PublicKey(pubkey));
    const solBalance = balanceLamports / 1e9;
    return res.json({ balance: solBalance });
  } catch (e) {
    console.error('[balance]: Error getting balance:', e);
    return res.status(500).json({message:"Error getting balance"});
  }
});

// New endpoint: Confirm transaction on-chain
app.post('/confirm-transaction', async (req, res) => {
  const { signature } = req.body;
  if (!signature) {
    return res.status(400).json({ message: "Missing signature" });
  }

  console.log('[confirm-transaction]: Confirming signature:', signature);
  try {
    const confirmation = await connection.confirmTransaction({
      signature,
      commitment: 'finalized'
    }, 60000); // 60 second timeout

    if (confirmation.value.err) {
      console.error('[confirm-transaction]: Transaction failed on-chain:', confirmation.value.err);
      return res.status(400).json({ message: "Transaction failed on-chain", error: confirmation.value.err });
    }

    console.log('[confirm-transaction]: Transaction confirmed!');
    return res.json({ message: "Transaction confirmed" });
  } catch (e) {
    console.error('[confirm-transaction]: Error confirming transaction:', e);
    return res.status(500).json({ message: "Transaction confirmation timed out or failed." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MVP server running on http://localhost:${PORT}`);
});
