const express = require('express');
const app = express();
const path = require('path');
const http = require('http').Server(app);
const bodyParser = require('body-parser');
const morgan = require('morgan');
const io = require('socket.io')(http);
// Jenkins Connection
const jenkinsApi = require('jenkins-api');

// App
const initJobs = require('./app/jobs');

// =====================
// Database
// =====================

const NeDB = require('nedb');
const db = new NeDB({
  filename: process.env.DATASTORE_PATH || path.join('./data/data.db'),
  autoload: true,
});

// Using a unique constraint with the index
db.ensureIndex({fieldName: 'name', unique: true}, (err) => {
  if (err) {
    console.error('There was an error creating the Database Index');
    process.exit(1);
  }
});

// =====================
// Jenkins
// =====================

console.log('Retrieving data from Jenkins');

if (!process.env.JENKINS_URL || !process.env.JENKINS_USER ||
    !process.env.JENKINS_TOKEN) {
  console.error(
    'JENKINS_URL, JENKINS_USER and JENKINS_TOKEN environment ' +
    'variables are mandatory'
  );
  // Exit with error
  process.exit(1);
}

const url = process.env.JENKINS_URL.split('//');
const user = process.env.JENKINS_USER;
const token = process.env.JENKINS_TOKEN;

const jenkins = jenkinsApi.init(`${url[0]}//${user}:${token}@${url[1]}`);
const jobs = initJobs(jenkins, db);

// Init
jobs.setup();

// Set an interval to update the jobs
const jobInterval = setInterval(() => {
  jobs.update();
}, 60 * 1000);

// =====================
// Initialization
// =====================

// Port
const port = process.env.PORT || 3001;

// Static files
app.use(express.static('client/build'));

// Parse JSON body
app.use(bodyParser.json());

// Login requests
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('common'));
} else {
  app.use(morgan('dev'));
}

// Health
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
  });
});

// Get all the jobs
app.get('/api/jobs', (req, res) => {
  db.find({}).sort({name: 1}).exec((err, docs) => {
    if (err) {
      res.json({
        status: false,
        reason: 'Error retrieving the data from the database',
      });
    } else {
      res.json({
        status: true,
        jobs: docs,
      });
    }
  });
});

app.get('*', (req, res) => {
  res.sendfile(__dirname + '/client/build/index.html');
});

// Create the server
http.listen(port, () => {
  console.log('Our app is running on http://localhost:' + port);
});

// Clean the interval before exit
process.on('SIGINT', () => {
  clearInterval(jobInterval);
});
