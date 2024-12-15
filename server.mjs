// server.js
import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import bodyParser from 'body-parser';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// Confirm creation
app.post('/confirm-creation', async (req, res) => {
  const { submissionId, txSignature, mintAddress, memo } = req.body;
  console.log('Received /confirm-creation request:', req.body);
  
  if (!submissionId || !txSignature || !mintAddress || !memo) {
    console.error('Missing parameters in /confirm-creation:', req.body);
    return res.status(400).json({message:"Missing parameters"});
  }

  const { data, error } = await supabase
    .from('submissions')
    .insert([{id: submissionId, memo, status:'active', token_mint:mintAddress, creation_tx:txSignature}]);

  if (error) {
    console.error('Supabase Insert Error in /confirm-creation:', error);
    return res.status(500).json({message:"DB insert error"});
  }

  console.log('Meme submission recorded:', data);
  return res.json({message:"Meme is now active"});
});

// Confirm upvote
app.post('/confirm-upvote', async (req, res) => {
  const { submissionId, userPubKey, txSignature } = req.body;
  console.log('Received /confirm-upvote request:', req.body);
  
  if (!submissionId || !userPubKey || !txSignature) {
    console.error('Missing parameters in /confirm-upvote:', req.body);
    return res.status(400).json({message:"Missing parameters"});
  }

  const { data, error } = await supabase
    .from('upvotes')
    .insert([{submission_id: submissionId, user_pubkey:userPubKey, tx_sig:txSignature}]);

  if (error) {
    console.error('Supabase Insert Error in /confirm-upvote:', error);
    return res.status(500).json({message:"DB insert error"});
  }

  console.log('Upvote recorded:', data);
  return res.json({message:"Upvote recorded"});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MVP server running on http://localhost:${PORT}`);
});
