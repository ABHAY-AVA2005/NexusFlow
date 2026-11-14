const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'nexusflow-server',
    uptime: process.uptime(),
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'NexusFlow server is running.' });
});

app.listen(port, () => {
  console.log(`NexusFlow server listening on http://localhost:${port}`);
});
