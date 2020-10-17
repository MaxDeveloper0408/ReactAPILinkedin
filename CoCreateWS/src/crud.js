
// const CoCreateXXX = require('./apis/xxx/CoCreate-xxx')
const CoCreateDataStripe = require('./apis/data-stripe/CoCreate-data-stripe')
const CoCreateLinkedin = require('./apis/linkedin/CoCreate-data-linkedin')
//const CoCreateTwilio = require('./apis/twilio/CoCreate-twilio')
//const CoCreateTwitter = require('./apis/twitter/CoCreate-twitter')

module.exports.WSManager = function(manager) {
	// new CoCreateXXX(manager)
	new CoCreateDataStripe(manager)
	new CoCreateLinkedin(manager)
	//new CoCreateTwilio(manager)
	//new CoCreateTwitter(manager);
}

