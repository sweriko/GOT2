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
  if (!submissionId || !txSignature || !mintAddress || !memo) {
    return res.status(400).json({message:"Missing parameters"});
  }

  const { data, error } = await supabase
    .from('submissions')
    .insert([{id: submissionId, memo, status:'active', token_mint:mintAddress, creation_tx:txSignature}]);

  if (error) {
    console.error(error);
    return res.status(500).json({message:"DB insert error"});
  }

  return res.json({message:"Meme is now active"});
});

// Confirm upvote
app.post('/confirm-upvote', async (req, res) => {
  const { submissionId, userPubKey, txSignature } = req.body;
  if (!submissionId || !userPubKey || !txSignature) {
    return res.status(400).json({message:"Missing parameters"});
  }

  const { data, error } = await supabase
    .from('upvotes')
    .insert([{submission_id: submissionId, user_pubkey:userPubKey, tx_sig:txSignature}]);

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
