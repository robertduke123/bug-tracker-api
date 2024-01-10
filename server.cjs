require("dotenv").config();
const express = require("express");
const bodyparser = require("body-parser");
const bcrypt = require("bcrypt-nodejs");
const cors = require("cors");
const knex = require("knex");

const app = express();
app.use(bodyparser.json());
app.use(cors());

const db = knex({
	client: "pg",
	connection: {
		host: process.env.RENDER_HOST,
		port: 5432,
		user: process.env.RENDER_USER,
		password: process.env.RENDER_PASSWORD,
		database: process.env.RENDER_DATABASE,
	},
});

console.log();

app.get("/", (req, res) => {
	res.json("it is working!");
});

app.post("/signin", (req, res) => {
	const { email, password } = req.body;
	if (!email || !password) {
		res.status(400).json("incorrect form submission");
	}
	db.select("email", "hash")
		.from("login")
		.where("email", "=", email)
		.then((data) => {
			if (email === "admin" || email === "employee") {
				return db
					.select("*")
					.from("users")
					.where("email", "=", email)
					.then((user) => {
						res.json(user[0]);
					});
			} else {
				const isValid = bcrypt.compareSync(password, data[0].hash);
				if (isValid) {
					return db
						.select("*")
						.from("users")
						.where("email", "=", email)
						.then((user) => {
							res.json(user[0]);
						})
						.catch((err) => res.status(400).json("unable to get user"));
				} else {
					res.status(400).json("wrong cridentials");
				}
			}
		})
		.catch((err) => res.status(400).json("wrong cridentials"));
});

app.post("/register", (req, res) => {
	const { firstName, lastName, phone, email, password } = req.body;
	if (!email || !firstName || !lastName || !password) {
		res.status(400).json("incorrect form submission");
	}
	const hash = bcrypt.hashSync(password);
	db.transaction((trx) => {
		trx
			.insert({
				hash: hash,
				email: email,
			})
			.into("login")
			.returning("email")
			.then((loginEmail) => {
				return trx("users")
					.returning("*")
					.insert({
						first_name: firstName,
						last_name: lastName,
						phone: phone,
						email: loginEmail[0].email,
						position: "Employee",
					})
					.then((user) => {
						res.json(user[0]);
					});
			})
			.then(trx.commit)
			.catch(trx.rollback);
	}).catch((err) => res.status(400).json("unable to register"));
});

app.put("/edit_team", (req, res) => {
	const { oldEmail, newFirst, newLast, newPhone, newEmail, newPosition } =
		req.body;
	db("login")
		.where("email", "=", oldEmail)
		.update({
			email: newEmail,
		})
		.returning("*")
		.then((data) => {
			return db("users")
				.where("email", "=", oldEmail)
				.update({
					first_name: newFirst,
					last_name: newLast,
					phone: newPhone,
					email: newEmail,
					position: newPosition,
				})
				.returning("*")
				.then((data) => res.json(data));
		});
});

app.delete("/delete_team", (req, res) => {
	const { email } = req.body;
	db("login")
		.where({ email: email })
		.del()
		.then(function () {
			db("users")
				.where({ email: email })
				.del()
				.then(function () {
					db("users")
						.select("*")
						.orderBy("id")
						.then((data) => res.json(data));
				});
		});
});

app.put("/edit_password", (req, res) => {
	const { email, oldPassword, newPassword } = req.body;
	db.select("*")
		.from("login")
		.where("email", "=", email)
		.then((data) => {
			const isValid = bcrypt.compareSync(oldPassword, data[0].hash);
			if (isValid) {
				const hash = bcrypt.hashSync(newPassword);
				db("login")
					.where("email", "=", email)
					.update({
						hash: hash,
					})
					.returning("*")
					.then((data) => res.json(data));
			}
		});
});

app.get("/profile/:id", (req, res) => {
	const { id } = req.params;
	db.select("*")
		.from("users")
		.where({ id })
		.then((user) => {
			if (user.length) {
				res.json(user[0]);
			} else {
				res.status(400).json("not found");
			}
		})
		.catch((err) => res.status(400).json("error getting user"));
});

app.get("/team", (req, res) => {
	db("users")
		.select("*")
		.orderBy("id")
		.then((team) => res.json(team));
});

app.get("/projects", (req, res) => {
	let finalProjects = [];
	db("projects")
		.select("*")
		.orderBy("id")
		.then((projects) => {
			projects.forEach((proj) => {
				let project = {
					name: proj.name,
					description: proj.description,
					contributor: proj.contributors,
					tickets: [],
				};
				finalProjects.push(project);
			});
			db("tickets")
				.select("*")
				.orderBy("id")
				.then((tickets) => {
					let finalTicket = {};

					tickets.forEach((ticket) => {
						finalTicket = {
							ticketTitle: ticket.ticket_title,
							author: ticket.author,
							description: ticket.description,
							status: ticket.status,
							priority: ticket.priority,
							type: ticket.type,
							time: ticket.time,
							assignedDevs: ticket.assigned_devs,
							comments: [],
						};
						for (let i = 0; i < ticket.comment_user.length; i++) {
							let comment = {
								user: ticket.comment_user[i],
								date: ticket.comment_date[i],
								comment: ticket.comment_text[i],
							};
							finalTicket.comments.push(comment);
						}

						finalProjects.forEach((project) => {
							if (ticket.project_name === project.name) {
								project.tickets.push(finalTicket);
							}
						});
					});
					res.json(finalProjects);
				});
		});
});

app.put("/projects", (req, res) => {
	const { name, description, contributor } = req.body;
	db("projects")
		.insert({
			name: name,
			description: description,
			contributors: contributor,
		})
		.then(res.json("project added success"));
});

app.put("/edit_project", (req, res) => {
	const { project, newName, newDescription, newContributor } = req.body;
	db("tickets")
		.where("project_name", "=", project)
		.update({
			project_name: newName,
		})
		.returning("*")
		.then((data) => {
			db("projects")
				.where("name", "=", project)
				.update({
					name: data[0].project_name,
					description: newDescription,
					contributors: newContributor,
				})
				.returning("*")
				.then((data) => res.json(data));
		});
});

app.delete("/delete_project", (req, res) => {
	const { projectName } = req.body;
	db("projects")
		.where({ name: projectName })
		.del()
		.then(function () {
			db("tickets")
				.where({ project_name: projectName })
				.del()
				.then(function () {
					db("projects")
						.select("*")
						.orderBy("id")
						.then((data) => res.json(data));
				});
		});
});

app.put("/tickets", (req, res) => {
	const {
		projectName,
		ticketTitle,
		author,
		description,
		status,
		priority,
		type,
		time,
		assignedDevs,
	} = req.body;

	db("tickets")
		.returning("*")
		.insert({
			project_name: projectName,
			ticket_title: ticketTitle,
			author: author,
			description: description,
			status: status,
			priority: priority,
			type: type,
			time: time,
			assigned_devs: assignedDevs,
			comment_user: [],
			comment_date: [],
			comment_text: [],
		})
		.then(res.json("ticket added success"));
});

app.put("/edit_ticket", (req, res) => {
	const {
		ticket,
		newTicketTitle,
		newAuthor,
		newDescription,
		newStatus,
		newPriority,
		newType,
		newTime,
		newAssignedDevs,
	} = req.body;
	db("tickets")
		.where("ticket_title", "=", ticket)
		.update({
			ticket_title: newTicketTitle,
			author: newAuthor,
			description: newDescription,
			status: newStatus,
			priority: newPriority,
			type: newType,
			time: newTime,
			assigned_devs: newAssignedDevs,
		})
		.returning("*")
		.then((data) => res.json(data));
});

app.delete("/delete_ticket", (req, res) => {
	const { ticketName } = req.body;
	db("tickets")
		.where({ ticket_title: ticketName })
		.del()
		.then(function () {
			db("tickets")
				.select("*")
				.orderBy("id")
				.then((data) => res.json(data));
		});
});

app.put("/comments", (req, res) => {
	const { ticketTitle, user, date, comment } = req.body;

	db("tickets")
		.where("ticket_title", "=", ticketTitle)
		.update({
			comment_user: db.raw("array_append( comment_user, ?)", [user]),
		})
		.update({
			comment_date: db.raw("array_append( comment_date, ?)", [date]),
		})
		.update({
			comment_text: db.raw("array_append( comment_text, ?)", [comment]),
		})
		.then(res.json("comment success"));
});

app.put("/delete_comment", (req, res) => {
	const { ticketName, delText } = req.body;
	db("tickets")
		.select("comment_user", "comment_date", "comment_text")
		.where({ ticket_title: ticketName })
		.then((data) => {
			let user = [];
			let date = [];
			let text = [];
			user.push(data[0].comment_user);
			date.push(data[0].comment_date);
			text.push(data[0].comment_text);

			let index = text.indexOf(delText);

			user.splice(index, 1);
			date.splice(index, 1);
			text.splice(index, 1);

			db("tickets")
				.where({ ticket_title: ticketName })
				.update({
					comment_user: user,
					comment_date: date,
					comment_text: text,
				})
				.then(function () {
					db("tickets")
						.select("*")
						.then((data) => res.json(data));
				});
		});
});

app.listen(process.env.PORT || 3000, () => {
	console.log(`app is running is running on ${process.env.PORT}`);
});
