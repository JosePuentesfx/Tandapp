const express = require('express')
const router = express.Router()
const dashboardController = require('../controllers/Dashboardcontroller')
const { isLoggedIn } = require('../middlewares/authMiddleware')

router.get('/', isLoggedIn, dashboardController.getDashboard)

module.exports = router