import { pgTable, text, timestamp, boolean, serial, jsonb } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("emailVerified").notNull(),
	image: text("image"),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull(),
	phoneNumber: text("phoneNumber").unique(),
	phoneNumberVerified: boolean("phoneNumberVerified"),
	role: text("role"),
	banned: boolean("banned"),
	banReason: text("banReason"),
	banExpires: timestamp("banExpires"),
	vipUntil: timestamp("vip_until")
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expiresAt").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull(),
	ipAddress: text("ipAddress"),
	userAgent: text("userAgent"),
	userId: text("userId").notNull().references(() => user.id)
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("accountId").notNull(),
	providerId: text("providerId").notNull(),
	userId: text("userId").notNull().references(() => user.id),
	accessToken: text("accessToken"),
	refreshToken: text("refreshToken"),
	idToken: text("idToken"),
	accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
	refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull()
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expiresAt").notNull(),
	createdAt: timestamp("createdAt"),
	updatedAt: timestamp("updatedAt")
});

export const ambassadors = pgTable("ambassadors", {
	id: serial("id").primaryKey(),
	userId: text("userId").references(() => user.id).notNull(),
	code: text("code").unique().notNull(),
	status: text("status").default("active"),
	createdAt: timestamp("createdAt").defaultNow().notNull()
});

export const events = pgTable("events", {
	id: text("id").primaryKey(),
	slug: text("slug").notNull().unique(),
	title: text("title").notNull(),
	subBrand: text("sub_brand").default("elplacerdc"),
	badge: text("badge"),
	badgeClass: text("badge_class"),
	date: timestamp("date", { withTimezone: true }).notNull(),
	displayDate: text("display_date"),
	timeRange: text("time_range"),
	venue: text("venue"),
	city: text("city").default("Bogotá"),
	description: text("description").notNull(),
	dressCode: text("dress_code"),
	imageUrl: text("image_url"),
	urlPath: text("url_path"),
	buttonText: text("button_text").default("Ver Detalles y Reservar"),
	pricingTiers: jsonb("pricing_tiers").default([]),
	freeEntryWindow: text("free_entry_window"),
	isActive: boolean("is_active").default(true),
	isPartner: boolean("is_partner").default(false),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});
