# Scourge Bot

A modular, production-ready Discord management bot built for structured organizations.

--------------------------------------------------

CORE FEATURES

- Verification & personnel database
- Owner verification checks with DM prompts
- Configurable verified member role
- Rank system (promote, demote, set, history)
- Moderation system (warnings + tracking)
- Event management system
- Report / case management system
- Dynamic admin role system (custom permission levels)
- Full command logging (Google Sheets)
- Override mode (owner-only control)
- Privacy and support information commands

--------------------------------------------------

SETUP REQUIREMENTS

Environment Variables (Railway)

DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=

GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEET_ID=

OVERRIDE_MODE=no
OWNER_DISCORD_ID=
VERIFIED_ROLE_ID=

VERIFIED_ROLE_ID is an optional fallback. /verifiedrole stores the active role in Bot Settings.

--------------------------------------------------

GOOGLE SHEETS STRUCTURE

Personnel
A: ID Number  
B: Discord Username  
C: Discord ID  
D: Discord Role  
E: Roblox Username  
F: Last Updated  
G: Enlistment Status  

Punishments
A: Case ID  
B: Target Username  
C: Target ID  
D: Action Type  
E: Reason  
F: Moderator Username  
G: Moderator ID  
H: Timestamp  

Rank History
A: Case ID  
B: Username  
C: ID  
D: Action Type  
E: Old Rank  
F: New Rank  
G: Reason  
H: Moderator Username  
I: Moderator ID  
J: Timestamp  

Events
A: Event ID  
B: Event Name  
C: Host Username  
D: Host ID  
E: Event Time  
F: Status  
G: Attendance Count  
H: Attendee IDs  
I: Created By  
J: Created At  
K: Closed At  

Reports
A: Case ID  
B: Report Type  
C: Details  
D: Submitted By Username  
E: Submitted By ID  
F: Assigned Staff Username  
G: Assigned Staff ID  
H: Status  
I: Result  
J: Created At  
K: Closed At  

Command Logs
A: Log ID  
B: User (username + ID)  
C: Role (role name + ID)  
D: Command  
E: Options (fully formatted with mentions)  
F: Channel ID  
G: Guild ID  
H: Override Mode  
I: Result (Allowed / Blocked / Error / Unhandled)  
J: Timestamp  

Admin Roles
A: Role Name  
B: Role ID  
C: Permission Level  
D: Added By  
E: Added At  

Bot Settings
A: Key
B: Value
C: Label
D: Updated At

--------------------------------------------------

PERMISSION SYSTEM

Permission levels are dynamic and assigned using:

/admin addrole

Level Structure:

Level 0 — Public  
Basic user commands

Level 1 — Viewer  
View logs, reports, attendance

Level 2 — Staff  
Moderation + report assignment

Level 3 — Senior Staff  
Event control + report resolution

Level 4 — Command Staff  
Promotions + advanced event control

Level 5 — High Command  
Rank logs + full rank control

Level 999 — Owner  
Full control of bot systems

--------------------------------------------------

COMMANDS

PERSONNEL SYSTEM

/verify  
- roblox_username  
Verify yourself

/update  
- roblox_username  
Update your record

/profile  
- user  
View profile

Owner Only:
/checkverify
- target: all or user
- user: required when target is user
DM unverified users the verification prompt
Bulk all-user verification DMs are limited to once every 24 hours.

/verifiedrole
- role
Set the role given to verified database users

--------------------------------------------------

MODERATION SYSTEM (Level 2)

/warn  
- user  
- reason  

/punishments  
- user  

--------------------------------------------------

RANK SYSTEM

Level 4:
/promote  
/demote  

Level 5:
/setrank  
/rankhistory  
/promotionlog  
/demotionlog  
/who_promoted  

--------------------------------------------------

EVENT SYSTEM

Level 3:
/event create  
/event start  
/event end  
/event attendee  

Level 4:
/event host  
/event delete  

Level 1:
/event attendance  
/event report  

Level 0:
/event history  
/event leaderboard  

--------------------------------------------------

REPORT SYSTEM

Level 0:
/report submit  
/report history  

Level 1:
/report list  
/report view  

Level 2:
/report assign  

Level 3:
/report close  
/report reopen  

--------------------------------------------------

ADMIN SYSTEM

Owner Only:
/admin addrole  
/admin setrolelevel  
/admin override_on  
/admin override_off  
/admin set_owner  

All Admins:
/admin roles  
/admin mypermission  

--------------------------------------------------

INFO / SUPPORT

/help
/ping
/privacy
/support

--------------------------------------------------

PRIVACY / DATA REQUESTS

The bot stores Discord IDs, usernames, role/rank information, Roblox usernames and IDs, verification codes, timestamps, command logs, moderation logs, rank logs, report records, and event records in the configured Google Sheet.

Users can run:
/privacy
/support

Use these commands to see what data is stored, why it is stored, and who to contact for access, correction, or deletion requests.

Server owners should also keep the bot's Discord Developer Portal privacy policy and terms links accurate and up to date.

--------------------------------------------------

LOGGING SYSTEM

Logs EVERY command automatically

Includes:
- User (name + ID)
- Role (name + ID)
- Command
- Options (fully expanded mentions)
- Channel
- Guild
- Override status
- Result (Allowed / Blocked / Error / Unhandled)
- Timestamp

--------------------------------------------------

OVERRIDE MODE

When enabled:

OVERRIDE_MODE=yes

- Only OWNER_DISCORD_ID can run commands
- All other users are blocked
- All attempts are logged

--------------------------------------------------

STATUS

Fully modular  
Fully permission controlled  
Fully logged  
Production ready  

--------------------------------------------------

FUTURE EXPANSION

- Discord live logging channel
- Dashboard UI
- Multi-server support
- Auto rank hierarchy enforcement
- Advanced analytics system

--------------------------------------------------
