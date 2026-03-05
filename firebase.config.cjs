const { initializeApp } = require("firebase/app");
const {
	getFirestore,
	collection,
	query,
	where,
	getDocs,
	doc,
	updateDoc,
	setDoc,
	deleteDoc,
	arrayUnion,
	getDoc,
	writeBatch,
} = require("firebase/firestore");

const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

dotenv.config();

const access = process.env.ACCESS_TOKEN_SECRET;
const refresh = process.env.REFRESH_TOKEN_SECRET;

const firebaseConfig = {
	apiKey: process.env.FIREBASE_API_KEY,
	authDomain: process.env.FIREBASE_AUTH_DOMAIN,
	projectId: process.env.FIREBASE_PROJECT_ID,
	storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
	messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
	appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const generateAccess = (user) => jwt.sign(user, access, { expiresIn: "5m" });

const verify = async (token) => {
	return new Promise((resolve, reject) => {
		jwt.verify(token, access, (err, decoded) => {
			if (err) reject(new Error("bad token"));
			else resolve(decoded);
		});
	});
};

const getId = async (collectionName) => {
	const snapshot = await getDocs(collection(db, collectionName));
	const data = snapshot.docs.map((doc) => doc.id);
	return parseInt(data[data.length - 1] || "0") + 1;
};

const getTeam = async () => {
	const teamSnapshot = await getDocs(collection(db, "users"));
	const data = teamSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
	return data;
};

const signIn = async (email, password) => {
	const snapshot = await getDocs(
		query(collection(db, "login"), where("email", "==", email)),
	);

	const userDoc = snapshot.docs.find((doc) =>
		bcrypt.compareSync(password, doc.data().hash),
	);

	return !!userDoc;
};

const registerUser = async (data) => {
	const { firstName, lastName, phone, email, password } = data;

	const hash = bcrypt.hashSync(password, 10);
	const id = String(await getId("login"));
	const position = "Employee";
	const refreshToken = jwt.sign({ email }, refresh, { expiresIn: "6h" });

	await setDoc(doc(db, "login", id), { email, hash, refresh: refreshToken });
	await setDoc(doc(db, "users", id), {
		email,
		first_name: firstName,
		last_name: lastName,
		phone,
		position,
	});

	return { id, firstName, lastName, email, phone, position, refreshToken };
};

const logOutUser = async (email) => {
	await updateData("login", "email", email, { refresh: null });
};

const getUsers = async (email) => {
	const userQ = query(collection(db, "users"), where("email", "==", email));
	const snapshot = await getDocs(userQ);

	const data = snapshot.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	}));

	return data[0];
};
const getUserById = async (id) => {
	const userDoc = doc(db, "users", id);
	const snapshot = await getDoc(userDoc);

	return { id: id, ...snapshot.data() };
};

const editUser = async (data) => {
	const { oldEmail, newFirst, newLast, newPhone, newEmail, newPosition } = data;

	const userData = {
		first_name: newFirst,
		last_name: newLast,
		phone: newPhone,
		email: newEmail,
		position: newPosition,
	};

	await updateData("login", "email", oldEmail, { email: newEmail });
	await updateData("users", "email", oldEmail, userData);

	return userData;
};

const editPassword = async (data) => {
	const { email, prevPassword, newPassword } = data;

	const snapshot = await getDocs(
		query(collection(db, "login"), where("email", "==", email)),
	);

	const validDoc = snapshot.docs.find((doc) =>
		bcrypt.compareSync(prevPassword, doc.data().hash),
	);

	if (!validDoc) {
		return "Previous password is incorrect";
	}

	const newHash = bcrypt.hashSync(newPassword, 10);
	await updateData("login", "email", email, { hash: newHash });

	return "Password successfully changed";
};

const getAccessToken = async (email) => {
	const user = { email };

	const accessToken = generateAccess(user);
	const refreshToken = jwt.sign(user, refresh, { expiresIn: "6h" });

	await updateData("login", "email", email, { refresh: refreshToken });

	return { access: accessToken, refresh: refreshToken };
};

const refreshLogin = async (token) => {
	const snapshot = await getDocs(
		query(collection(db, "login"), where("refresh", "==", token)),
	);

	if (snapshot.empty) {
		throw new Error("refresh token is incorrect");
	}

	const loginDoc = snapshot.docs[0];

	jwt.verify(token, refresh);

	const accessToken = generateAccess({
		email: loginDoc.data().email,
	});

	return accessToken;
};

const updateData = async (collectionName, key, value, data) => {
	const updateQuery = query(
		collection(db, collectionName),
		where(key, "==", value),
	);

	const updateSnapshot = await getDocs(updateQuery);

	for (const document of updateSnapshot.docs) {
		const docRef = doc(db, collectionName, document.id);
		await updateDoc(docRef, data);
	}
};

const deleteDocument = async (collection, docId) => {
	await deleteDoc(doc(db, collection, docId));
	return "document deleted successfully";
};

const deleteField = async (collection, docId, field) => {
	await updateDoc(doc(db, collection, docId), { [field]: deleteField() });
};

const getProjects = async () => {
	const projectSanpshot = await getDocs(collection(db, "projects"));
	const data = await projectSanpshot.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
		tickets: [],
	}));
	return data;
};
const getTickets = async () => {
	const ticketSanpshot = await getDocs(collection(db, "tickets"));
	const data = await ticketSanpshot.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	}));
	return data;
};

const addProject = async (name, description, contributor) => {
	const id = String(await getId("projects"));
	await setDoc(doc(db, "projects", id), {
		name: name,
		description: description,
		contributors: contributor,
	});

	return "project added successfully";
};

const editProject = async (data) => {
	const { project, newName, newDescription, newContributor } = data;
	updateData("tickets", "porject_name", project, { project_name: newName });
	updateData("projects", "name", project, {
		name: newName,
		description: newDescription,
		contributors: newContributor,
	});
	return "project successfully edited";
};

const deleteProject = async (name) => {
	const projectQ = query(collection(db, "projects"), where("name", "==", name));

	const projectSnapshot = await getDocs(projectQ);

	const docToDelete = projectSnapshot.docs[0];
	await deleteDoc(docToDelete.ref);

	const ticketQ = query(
		collection(db, "tickets"),
		where("project_name", "==", name),
	);

	const ticketSnapshot = await getDocs(ticketQ);

	const batch = writeBatch(db);

	ticketSnapshot.forEach((docSnap) => {
		batch.delete(docSnap.ref);
	});

	await batch.commit();

	return "project deleted successfully";
};

const addTicket = async (data) => {
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
	} = data;
	const id = String(await getId("tickets"));
	await setDoc(doc(db, "tickets", id), {
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
	});

	return "ticket added successfully";
};

const editTicket = async (data) => {
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
	} = data;
	updateData("tickets", "ticket_title", ticket, {
		ticket_title: newTicketTitle,
		author: newAuthor,
		description: newDescription,
		status: newStatus,
		priority: newPriority,
		type: newType,
		time: newTime,
		assigned_devs: newAssignedDevs,
	});
	return "ticket successfully edited";
};

const deleteTicket = async (name) => {
	const q = query(collection(db, "tickets"), where("ticket_title", "==", name));

	const snapshot = await getDocs(q);

	const docToDelete = snapshot.docs[0];
	await deleteDoc(docToDelete.ref);
	return "ticket deleted successfully";
};

const addComment = async (data) => {
	const { ticketTitle, user, date, comment } = data;
	const q = query(
		collection(db, "tickets"),
		where("ticket_title", "==", ticketTitle),
	);

	const snap = await getDocs(q);

	await snap.docs.map(async (doc) => {
		const users = doc.data().comment_user || [];
		const dates = doc.data().comment_date || [];
		const comments = doc.data().comment_text || [];
		await updateDoc(doc.ref, {
			comment_user: [...users, user],
			comment_date: [...dates, date],
			comment_text: [...comments, comment],
		});
	});

	return "comment added successfully";
};

const deleteComment = async (data) => {
	const { ticketTitle, date } = data;
	const q = query(
		collection(db, "tickets"),
		where("ticket_title", "==", ticketTitle),
	);

	const snap = await getDocs(q);

	await snap.docs.map(async (doc) => {
		const users = doc.data().comment_user || [];
		const dates = doc.data().comment_date || [];
		const comments = doc.data().comment_text || [];

		const index = dates.indexOf(date);

		if (index !== -1) {
			users.splice(index, 1);
			dates.splice(index, 1);
			comments.splice(index, 1);
		} else {
			return "no comment exists";
		}

		await updateDoc(doc.ref, {
			comment_user: users,
			comment_date: dates,
			comment_text: comments,
		});
	});

	return "comment deleted successfully";
};

module.exports = {
	verify,
	signIn,
	registerUser,
	logOutUser,
	getUsers,
	getUserById,
	editUser,
	editPassword,
	getAccessToken,
	refreshLogin,
	updateData,
	getId,
	deleteDocument,
	deleteField,
	getTeam,
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
};
