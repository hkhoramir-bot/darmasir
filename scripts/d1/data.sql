-- تولید خودکار توسط export-sqlite-to-d1.ts — داده‌های محلی درمسیر
-- اجرا: bunx wrangler d1 execute darmasir-db --remote --file=scripts/d1/data.sql -y

DELETE FROM "Favorite";

DELETE FROM "DailyRoute";
INSERT INTO "DailyRoute" ("id", "kind", "label", "fromStationId", "toStationId", "fromName", "toName", "createdAt") VALUES ('cmwchh3310000szvlkjs66667', 'home', 'به سمت خانه', 'enghelab-sq', 'tajrish', 'میدان انقلاب اسلامی', 'تجریش', 1794423589598);

DELETE FROM "TripHistory";
INSERT INTO "TripHistory" ("id", "fromStationId", "fromName", "toStationId", "toName", "minutes", "transfers", "fare", "pref", "createdAt") VALUES ('cmwf0dgbm0001sr57rm5klh6a', 'enghelab-sq', 'میدان انقلاب اسلامی', 'tajrish', 'تجریش', 44, 2, 3800, 'fastest', 1794576265187);
INSERT INTO "TripHistory" ("id", "fromStationId", "fromName", "toStationId", "toName", "minutes", "transfers", "fare", "pref", "createdAt") VALUES ('cmwf0h07m0002sr57br6wax9p', 'enghelab-sq', 'میدان انقلاب اسلامی', 'tajrish', 'تجریش', 44, 2, 3800, 'fastest', 1794576430930);
INSERT INTO "TripHistory" ("id", "fromStationId", "fromName", "toStationId", "toName", "minutes", "transfers", "fare", "pref", "createdAt") VALUES ('cmwf0sxme0000sr7fnfcpmije', 'enghelab-sq', 'میدان انقلاب اسلامی', 'tajrish', 'تجریش', 44, 2, 3800, 'fastest', 1794576987446);
INSERT INTO "TripHistory" ("id", "fromStationId", "fromName", "toStationId", "toName", "minutes", "transfers", "fare", "pref", "createdAt") VALUES ('cmwf34wvo0000odvg7jgxrl5c', 'enghelab-sq', 'میدان انقلاب اسلامی', 'tajrish', 'تجریش', 44, 2, 3800, 'fastest', 1794580905588);
INSERT INTO "TripHistory" ("id", "fromStationId", "fromName", "toStationId", "toName", "minutes", "transfers", "fare", "pref", "createdAt") VALUES ('cmwf35rqc0001odvgku5nsmoc', 'enghelab-sq', 'میدان انقلاب اسلامی', 'tajrish', 'تجریش', 44, 2, 3800, 'fastest', 1794580945572);
INSERT INTO "TripHistory" ("id", "fromStationId", "fromName", "toStationId", "toName", "minutes", "transfers", "fare", "pref", "createdAt") VALUES ('cmwf5g2hj0002odvgnjm4seyc', 'enghelab-sq', 'میدان انقلاب اسلامی', 'tajrish', 'تجریش', 44, 2, 3800, 'fastest', 1794584785303);
INSERT INTO "TripHistory" ("id", "fromStationId", "fromName", "toStationId", "toName", "minutes", "transfers", "fare", "pref", "createdAt") VALUES ('cmwf5oqti0003odvgfr7t86ae', 'enghelab-sq', 'میدان انقلاب اسلامی', 'tajrish', 'تجریش', 44, 2, 3800, 'fastest', 1794585190086);

DELETE FROM "User";
INSERT INTO "User" ("id", "name", "phone", "email", "passwordHash", "status", "createdAt", "lastLoginAt") VALUES ('cmwi1xpi70000wj1j4xyff2uo', 'علی تست', '09123456789', 'ali@test.com', 'f42d991143db0f8bc240d67d058a9c01:828649d8bddcb841c244a560e6ad419701e22ef2bdd9ed0fada79ef8e3bb4749fb72c4f1b1e05c96cb9eaacf73b0a4e30c3ff51bd8116f90d8c74fc6bae0b604', 'active', 1794760288352, 1794807255910);
INSERT INTO "User" ("id", "name", "phone", "email", "passwordHash", "status", "createdAt", "lastLoginAt") VALUES ('cmwi237h4000cwj1js13fxx5w', 'کاربر آزمایشی', '09361112233', 'test@metrojo.app', 'ee37cbaa472e1b9922bd88e01e3091ea:d30fb2d82e01d1d19f64330d2a2b2034c732adc00a5d9434bd6bc7d50a6fc3ad16d2eabd9706b89322bf93420117666705cc2f6bb8e0d354f81457d7a35e619b', 'active', 1794760544921, 1794760977759);
INSERT INTO "User" ("id", "name", "phone", "email", "passwordHash", "status", "createdAt", "lastLoginAt") VALUES ('cmwit5qqo0001qsalxm2rdfbu', 'کاربر 4567', '09121234567', NULL, NULL, 'active', 1794806012833, 1794830495652);
INSERT INTO "User" ("id", "name", "phone", "email", "passwordHash", "status", "createdAt", "lastLoginAt") VALUES ('cmwitc9gw0007qsal5v9qrz2i', 'حسین خرّم', '09050936587', 'hkhoramir@gmail.com', 'bd8b01754ea050ebcd21c186f13c9311:344b0b9288169be852964fa012ca1d0027ca0f80cb25e8dcedab351a299242bc86ebea0471fb0fe777fe86a7975bedbdaf646679ea9eec92868e3f82b17f0d79', 'active', 1794806317041, 1794899818612);

DELETE FROM "Session";
INSERT INTO "Session" ("id", "token", "userId", "device", "createdAt", "lastSeenAt", "expiresAt") VALUES ('cmwi1xpi90002wj1jais9x9cm', 'b1f094a890175be03f5da09a112130c8deda59cf4a911a2510be111be3c520c1', 'cmwi1xpi70000wj1j4xyff2uo', 'web', 1794760288354, 1794760288354, 1797352288352);
INSERT INTO "Session" ("id", "token", "userId", "device", "createdAt", "lastSeenAt", "expiresAt") VALUES ('cmwi1xtc50005wj1jr41a4ere', '223c2fefa5e2a9812b6bfe227746d4c322d2eaaacf4b25653b178383dffcdeb4', 'cmwi1xpi70000wj1j4xyff2uo', 'web', 1794760293317, 1794760293424, 1797352293316);
INSERT INTO "Session" ("id", "token", "userId", "device", "createdAt", "lastSeenAt", "expiresAt") VALUES ('cmwi1xyki000bwj1jjpdb3iba', 'e29cf50c1efb34bc77cae23c34fa5fd0d0ee0a65154e1b871bdcfb9fa49022b3', 'cmwi1xpi70000wj1j4xyff2uo', 'web', 1794760300098, 1794760300098, 1797352300097);
INSERT INTO "Session" ("id", "token", "userId", "device", "createdAt", "lastSeenAt", "expiresAt") VALUES ('cmwi28ja7000gwj1js0xbf1wl', 'ea67c3b49a09b85dfacd95725c8596fa2c7fae68fa3b4c6b45956e81a13ad513', 'cmwi237h4000cwj1js13fxx5w', 'web', 1794760793503, 1794760793503, 1797352793502);
INSERT INTO "Session" ("id", "token", "userId", "device", "createdAt", "lastSeenAt", "expiresAt") VALUES ('cmwi2chgi000lwj1jnj0pbnd4', 'a505c9ab741ea5420e5d5be58f37ac95b949d2d8e873141d050cad808f4d0bb9', 'cmwi237h4000cwj1js13fxx5w', 'web', 1794760977762, 1794761027093, 1797352977761);
INSERT INTO "Session" ("id", "token", "userId", "device", "createdAt", "lastSeenAt", "expiresAt") VALUES ('cmwit5qqq0003qsalof99czps', '1b3f1dcde9843ec94124c5ebe6163cd8a24883d95b2a7517dafc288acf3a5951', 'cmwit5qqo0001qsalxm2rdfbu', 'web', 1794806012835, 1794806012835, 1797398012834);
INSERT INTO "Session" ("id", "token", "userId", "device", "createdAt", "lastSeenAt", "expiresAt") VALUES ('cmwit6cro0006qsalxhdynocm', 'fff333aed86e9ba11c49896dc3b9513c0674e633dd243bab664999b17f9a0613', 'cmwit5qqo0001qsalxm2rdfbu', 'web', 1794806041381, 1794809216897, 1797398041378);
INSERT INTO "Session" ("id", "token", "userId", "device", "createdAt", "lastSeenAt", "expiresAt") VALUES ('cmwitwdwv000cqsalwwjdcykf', '335f283a1fe09dc2dd758be45223fb7b32d5d49676ee085e9a7c175a4cca3f40', 'cmwi1xpi70000wj1j4xyff2uo', 'web', 1794807255920, 1794807255920, 1797399255914);
INSERT INTO "Session" ("id", "token", "userId", "device", "createdAt", "lastSeenAt", "expiresAt") VALUES ('cmwj7qht20003rmlq874xbb6z', '100a073b65ae9f1ec0d6502c1973be03a045a3660b31ac92fc5fbabb1bdcc22d', 'cmwit5qqo0001qsalxm2rdfbu', 'web', 1794830495655, 1794831153136, 1797422495654);
INSERT INTO "Session" ("id", "token", "userId", "device", "createdAt", "lastSeenAt", "expiresAt") VALUES ('cmwkd0bqv0007tkplwsl7x5cz', '56daabaa6abe7cb8a2f347e4e5fc854b78a6285a809b3af30ef9f686d8f76a56', 'cmwitc9gw0007qsal5v9qrz2i', 'web', 1794899818615, 1794985010369, 1797491818613);

DELETE FROM "OtpCode";
INSERT INTO "OtpCode" ("id", "phone", "code", "attempts", "used", "expiresAt", "createdAt") VALUES ('cmwi2a9ie000hwj1jxg3ia373', '09361112233', '948779', 0, 1, 1794761054150, 1794760874151);
INSERT INTO "OtpCode" ("id", "phone", "code", "attempts", "used", "expiresAt", "createdAt") VALUES ('cmwit5n9t0000qsalppyrzb37', '09121234567', '417215', 0, 1, 1794806188337, 1794806008338);
INSERT INTO "OtpCode" ("id", "phone", "code", "attempts", "used", "expiresAt", "createdAt") VALUES ('cmwit66hr0004qsal1g3tjawp', '09121234567', '293402', 0, 1, 1794806213246, 1794806033247);
INSERT INTO "OtpCode" ("id", "phone", "code", "attempts", "used", "expiresAt", "createdAt") VALUES ('cmwitw99v000aqsal0fym6rum', '09123456789', '368065', 0, 1, 1794807429907, 1794807249908);
INSERT INTO "OtpCode" ("id", "phone", "code", "attempts", "used", "expiresAt", "createdAt") VALUES ('cmwj7pby00000rmlq7wnav6j2', '09121234567', '791537', 0, 1, 1794830621399, 1794830441400);
INSERT INTO "OtpCode" ("id", "phone", "code", "attempts", "used", "expiresAt", "createdAt") VALUES ('cmwj7q8710001rmlq06ys2pbg', '09121234567', '123658', 0, 1, 1794830663197, 1794830483198);

DELETE FROM "SupportTicket";
INSERT INTO "SupportTicket" ("id", "name", "contact", "category", "subject", "message", "status", "createdAt", "repliedAt", "reply") VALUES ('cmwkhnmbz000utkplo1n7vflr', 'حسین خرم', 'hkhoramir@gmail.com', 'general', 'پرسش تست', 'این یک پیام تست می باشد', 'open', 1794907623887, NULL, NULL);

