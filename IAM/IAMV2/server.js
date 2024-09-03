const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const path = require('path');
const app = express();

const port = process.env.PORT || 3000;  // Use environment variable or default to 3000

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/run-query', (req, res) => {
    const { 'role-months': roleMonths, 'user-months': userMonths, 'group-months': groupMonths, 'login-months': loginMonths, 'nonlogin-months': nonloginMonths, 'start-date': startDate, 'end-date': endDate } = req.body;

    // Input validation
    if (!roleMonths || !userMonths || !groupMonths || !loginMonths || !nonloginMonths) {
        return res.status(400).send('All month fields are required.');
    }

    const command = `node iam1v2.js --role-months=${roleMonths} --user-months=${userMonths} --group-months=${groupMonths} --login-months=${loginMonths} --nonlogin-months=${nonloginMonths} --start-date=${startDate} --end-date=${endDate}`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Execution error: ${error}`);
            return res.status(500).send(`Server Error: ${error.message}`);
        }
        if (stderr) {
            console.error(`Command error: ${stderr}`);
            return res.status(500).send(`Error: ${stderr}`);
        }

        console.log(`Command output: ${stdout}`);

        let responseContent = `<pre>${stdout}</pre>`;
        if (stdout.includes("Extended details saved to IAM_EC2_Details_Extended.json")) {
            responseContent += `
                <h2>Download JSON File</h2>
                <a href="/IAM_EC2_Details_Extended.json" download>
                    <button>Download IAM_EC2_Details_Extended.json</button>
                </a>`;
        }

        res.send(responseContent);
    });
});

// Serve the JSON file from the root directory
app.get('/IAM_EC2_Details_Extended.json', (req, res) => {
    const filePath = path.join(__dirname, 'IAM_EC2_Details_Extended.json');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`File serving error: ${err}`);
            res.status(500).send('Could not serve the file.');
        }
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
