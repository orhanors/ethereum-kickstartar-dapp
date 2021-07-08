const assert = require("assert");
const ganache = require("ganache-cli");
const Web3 = require("web3");
const compiledFactory = require("../ethereum/build/CampaignFactory.json");
const compiledCampaign = require("../ethereum/build/Campaign.json");

const web3 = new Web3(ganache.provider());

const MINIMUM_CONTRIBITION = "100";
let accounts;
let campaign;
let factory;
let campaignAddress;

beforeEach(async () => {
	accounts = await web3.eth.getAccounts();

	factory = await new web3.eth.Contract(JSON.parse(compiledFactory.interface))
		.deploy({ data: compiledFactory.bytecode })
		.send({ from: accounts[0], gas: "1000000" });

	await factory.methods
		.createCampaign(MINIMUM_CONTRIBITION)
		.send({ from: accounts[0], gas: "1000000" });

	[campaignAddress] = await factory.methods.getDeployedCampaigns().call();

	campaign = await new web3.eth.Contract(
		JSON.parse(compiledCampaign.interface),
		campaignAddress
	);
});

describe("Campaigns", () => {
	it("deploys a factory and campaign", () => {
		//Check if the contracts have address
		assert.ok(factory.options.address);
		assert.ok(campaign.options.address);
	});

	it("marks creator as the manager", async () => {
		const manager = await campaign.methods.manager().call();
		assert.strictEqual(accounts[0], manager);
	});

	it("allows people to send money and marks them as approvers", async () => {
		await campaign.methods
			.contribute()
			.send({ from: accounts[1], value: "200" });

		//When we try to reach mapping, we can just access spesific element
		const isContributor = await campaign.methods
			.approvers(accounts[1])
			.call();
		assert(isContributor);
	});

	it("requires a minimum contribution", async () => {
		const wrongContribution = toString(parseInt(MINIMUM_CONTRIBITION) - 20);
		try {
			await campaign.methods
				.contribute()
				.send({ value: wrongContribution, from: accounts[1] });

			assert(false);
		} catch (error) {
			assert(error);
		}
	});

	it("allows manager to create a payment request", async () => {
		const initialRequest = {
			description: "Buy batteries",
			value: "200",
			address: accounts[1],
		};
		await campaign.methods
			.createRequest(
				initialRequest.description,
				initialRequest.value,
				initialRequest.address
			)
			.send({ from: accounts[0], gas: "1000000" });

		const resultRequest = await campaign.methods.requests(0).call();

		assert.strictEqual(
			initialRequest.description,
			resultRequest.description
		);
	});

	it("processes request", async () => {
		await campaign.methods.contribute().send({
			from: accounts[0],
			value: web3.utils.toWei("10", "ether"),
		});

		await campaign.methods
			.createRequest(
				"Some description",
				web3.utils.toWei("5", "ether"),
				accounts[1]
			)
			.send({ from: accounts[0], gas: "1000000" });

		await campaign.methods
			.approveRequest(0)
			.send({ from: accounts[0], gas: "1000000" });

		await campaign.methods
			.finalizeRequest(0)
			.send({ from: accounts[0], gas: "1000000" });

		let balance = await web3.eth.getBalance(accounts[1]);
		balance = web3.utils.fromWei(balance, "ether");
		balance = parseFloat(balance);

		assert(balance > 104);
	});
});
