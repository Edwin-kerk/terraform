const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const port = 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/run-query', (req, res) => {
    const roleMonths = req.body['role-months'];
    const userMonths = req.body['user-months'];
    const groupMonths = req.body['group-months'];
    const loginMonths = req.body['login-months'];
    const nonloginMonths = req.body['nonlogin-months'];
    const startDate = req.body['start-date'];
    const endDate = req.body['end-date'];

    const command = `node iam1v2.js --role-months=${roleMonths} --user-months=${userMonths} --group-months=${groupMonths} --login-months=${loginMonths} --nonlogin-months=${nonloginMonths} --start-date=${startDate} --end-date=${endDate}`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.send(`Error: ${error.message}`);
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return res.send(`Error: ${stderr}`);
        }
        console.log(`stdout: ${stdout}`);
        res.send(`<pre>${stdout}</pre>`);
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
