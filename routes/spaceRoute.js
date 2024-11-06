const express = require('express');
const router = express.Router();
const space = require('../controllers/SpaceController')
const auth = require('../middlewares/AuthMiddleware');
const upload = require('../config/multer');


// space routes
router.post('/user/space/add', auth.userVerification, upload.array('images', 4), space.addSpace)
router.put('/user/space/edit/:id', auth.userVerification,upload.array('images', 4), space.editSpace)
router.get('/user/space/:id', space.getSpace);
router.delete('/user/spaces/:id', space.deleteSpace)
router.get('/user/spaces', auth.userVerification, space.getUserSpaces);

// general
router.get('/space/:id', space.getSpace);
// router.get('/spaces/:type', space.getSpacesByType);
router.get('/spaces', space.getAllSpaces);

// for the search the inputs are:
//  1. where do you need a space; meaning Location?
// 2. which type of spcae; co-working space?, meeting or conference rooms etc.
// 3. purpose of space; rent or daily book?
router.get('/spaces/search', space.searchSpaces); 

module.exports = router;