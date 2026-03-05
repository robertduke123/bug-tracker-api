require("dotenv").config();
const express = require("express");
const bodyparser = require("body-parser");
const bcrypt = require("bcrypt-nodejs");
const cors = require("cors");
const knex = require("knex");
const {
	signIn,
	getAccessToken,
	verify,
	getUsers,
	registerUser,
	editUser,
	deleteDocument,
	deleteField,
	getTeam,
	getUserById,
	getProjects,
	getTickets,
	addProject,
	editProject,
	deleteProject,
	addTicket,
	editTicket,
	deleteTicket,
	addComment,
	deleteComment,
	editPassword,
} = require("./firebase.config.cjs");

const app = express();
app.use(bodyparser.json());
app.use(cors());

// const db = knex({
// 	client: "pg",
// 	connection: {
// 		host: process.env.RENDER_HOST,
// 		port: 5432,
// 		user: process.env.RENDER_USER,
// 		password: process.env.RENDER_PASSWORD,
// 		database: process.env.RENDER_DATABASE,
// 	},
// });

const db = knex({
	client: "pg",
	connection: {
		host: "127.0.0.1",
		user: "postgres",
		password: "Wiggles123",
		database: "bug-tracker",
	},
});

console.log();

app.get("/", (req, res) => {
	res.json("it is working!");
});

app.get("/test", (req, res) => {
	db.select("*")
		.from("login")
		.then((data) => res.json(data))
		.catch((err) => res.json(err));
});

app.post("/signin", async (req, res) => {
	const { email, password } = req.body;
	if (!email || !password) {
		res.status(400).json("incorrect form submission");
	}

	if (email !== "admin" || email !== "employee") {
		const valid = await signIn(email, password);

		if (!valid) {
			return res.status(401).json("wrong credentials");
		}
	}
	const tokens = await getAccessToken(email);

	await verify(tokens.access);

	const userData = await getUsers(email);

	return res.json({
		refresh: tokens.refresh,
		userData,
	});
});

app.post("/register", (req, res) => {
	const { firstName, lastName, phone, email, password } = req.body;
	if (!email || !firstName || !lastName || !password) {
		res.status(400).json("incorrect form submission");
	}

	registerUser(req.body).then((data) => res.json(data));
});

app.put("/edit_team", (req, res) => {
	editUser(req.body).then((data) => res.json(data));
});

app.delete("/delete_team", async (req, res) => {
	const { id } = req.body;
	await deleteDocument("login", id);
	await deleteDocument("users", id);
	await getTeam().then((data) => res.json(data));
});

app.put("/edit_password", (req, res) => {
	editPassword(req.body).then((data) => res.json(data));
});

app.get("/profile/:id", (req, res) => {
	const { id } = req.params;
	getUserById(id).then((data) => res.json(data));
});

app.get("/team", (req, res) => {
	getTeam().then((data) => res.json(data));
});

app.get("/get_projects", async (req, res) => {
	const projects = await getProjects();
	const tickets = await getTickets();
	const lookup = tickets.reduce((acc, item) => {
		const key = item.project_name;
		if (!acc[key]) {
			acc[key] = [];
		}

		// Remove `name` using destructuring
		const { project_name, ...rest } = item;
		acc[key].push(rest);

		return acc;
	}, {});

	// Attach matches to array1
	res.json(
		projects.map((obj) => ({
			...obj,
			tickets: lookup[obj.name] || [],
		})),
	);
});

app.put("/projects", (req, res) => {
	const { name, description, contributor } = req.body;

	addProject(name, description, contributor).then((data) => res.json(data));
});

app.put("/edit_project", (req, res) => {
	editProject(req.body).then((data) => res.json(data));
});

app.delete("/delete_project", (req, res) => {
	const { projectName } = req.body;
	deleteProject(projectName).then((data) => res.json(data));
});

app.put("/tickets", (req, res) => {
	addTicket(req.body).then((data) => res.json(data));
});

app.put("/edit_ticket", (req, res) => {
	editTicket(req.body).then((data) => res.json(data));
});

app.delete("/delete_ticket", (req, res) => {
	const { ticketName } = req.body;
	deleteTicket(ticketName).then((data) => res.json(data));
});

app.put("/comments", (req, res) => {
	addComment(req.body).then((data) => res.json(data));
});

app.put("/delete_comment", (req, res) => {
	deleteComment(req.body).then((data) => res.json(data));
});

app.listen(4000, () => console.log("app is running"));
