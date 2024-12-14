import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { Keypair } from '@solana/web3.js';
import bodyParser from 'body-parser';

const JACKPOT_WALLET = process.env.JACKPOT_WALLET;
const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const app = express();
app.use(bodyParser.json());

// Serve static files from "public"
app.use(express.static('public'));

app.post('/submit-meme', async (req, res) => {
  try {
    const { memo, userPubKey } = req.body;
    if (!memo || memo.length < 10 || !userPubKey) {
      return res.status(400).json({message:"Invalid input"});
    }

    const uniqueId = uuidv4();
    const { data:insertData, error:insertError } = await supabase
      .from('submissions')
      .insert([{ id: uniqueId, memo, status: 'pending' }])
      .select();

    if (insertError) {
      console.error(insertError);
      return res.status(500).json({message:"DB Insert Error"});
    }

    const mintKeypair = Keypair.generate();
    const mintPubkeyStr = mintKeypair.publicKey.toBase58();

    const tokenName = 'MemeToken-' + uniqueId.substring(0,5);

    const payload = {
      publicKey: userPubKey,
      action: 'create',
      tokenMetadata: {
        name: tokenName,
        symbol: 'MEME',
        uri: 'https://example.com/metadata.json'
      },
      mint: mintPubkeyStr,
      denominatedInSol: 'true',
      amount: 0.01,
      slippage: 10,
      priorityFee: 0.0005,
      pool: 'pump'
    };

    const response = await fetch('https://pumpportal.fun/api/trade-local', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Pumpportal creation error:', await response.text());
      return res.status(500).json({message:"Failed to get creation transaction"});
    }

    const txBytes = await response.arrayBuffer();
    const txBase64 = Buffer.from(new Uint8Array(txBytes)).toString('base64');

    return res.json({
      message: "Transaction ready for signing",
      submissionId: uniqueId,
      txBase64,
      mint: mintPubkeyStr
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({message:"Internal error"});
  }
});

app.post('/confirm-creation', async (req, res) => {
  const { submissionId, txSignature, mintAddress } = req.body;

  if (!submissionId || !txSignature || !mintAddress) {
    return res.status(400).json({message:"Missing parameters"});
  }

  const { data, error } = await supabase
    .from('submissions')
    .update({status: 'active', token_mint: mintAddress, creation_tx: txSignature})
    .eq('id', submissionId);

  if (error) {
    console.error(error);
    return res.status(500).json({message:"DB update error"});
  }

  return res.json({message:"Meme is now active"});
});

app.post('/upvote', async (req, res) => {
  const { submissionId, userPubKey } = req.body;

  if (!submissionId || !userPubKey) {
    return res.status(400).json({message:"Missing parameters"});
  }

  let { data:submission, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (error || !submission || !submission.token_mint || submission.status !== 'active') {
    return res.status(404).json({message:"Submission not found or not active"});
  }

  const buyPayload = {
    publicKey: userPubKey,
    action: 'buy',
    mint: submission.token_mint,
    amount: 0.01,
    denominatedInSol: 'true',
    slippage: 10,
    priorityFee: 0.0005,
    pool: 'pump'
  };

  const response = await fetch('https://pumpportal.fun/api/trade-local', {
    method: 'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(buyPayload)
  });

  if (!response.ok) {
    console.error('Pumpportal buy error:', await response.text());
    return res.status(500).json({message:"Failed to get buy tx"});
  }

  const txBytes = await response.arrayBuffer();
  const txBase64 = Buffer.from(new Uint8Array(txBytes)).toString('base64');

  return res.json({
    message: "Upvote transaction ready for signing",
    txBase64
  });
});

app.post('/confirm-upvote', async (req, res) => {
  const { submissionId, userPubKey, txSignature } = req.body;

  if (!submissionId || !userPubKey || !txSignature) {
    return res.status(400).json({message:"Missing parameters"});
  }

  const { data, error } = await supabase
    .from('upvotes')
    .insert([{submission_id: submissionId, user_pubkey: userPubKey, tx_sig: txSignature}]);

  if (error) {
    console.error(error);
    return res.status(500).json({message:"DB insert error"});
  }

  return res.json({message:"Upvote recorded"});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MVP server running on http://localhost:${PORT}`);
});
