const express = require('express');
const cors = require('cors');
const graphsRouter = require('./routes/graphs');
const config = require('./config/env');

const app = express();
const port = config.port;

app.use(cors());
app.use(express.json());
app.use('/api/graphs', graphsRouter);

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
