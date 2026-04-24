# Scourge Bot

A full-featured Discord management bot designed for structured organizations.

--------------------------------------------------

CORE FEATURES

- Verification & personnel tracking
- Rank management (promotions, demotions, logs)
- Moderation system (warnings + history)
- Event management system
- Report / case system
- Full command logging (Google Sheets)
- Override mode (owner-only control)

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
B: User
C: Role
D: Command
E: Options
F: Channel ID
G: Guild ID
H: Override Mode
I: Result
J: Timestamp

--------------------------------------------------

COMMANDS

PERSONNEL SYSTEM

/verify
- roblox_username (string)
Verify yourself into the system

/update
- roblox_username (string)
Update your record

/profile
- user (user)
View a user's profile

--------------------------------------------------

MODERATION SYSTEM

/warn
- user (user)
- reason (string)
Warn a user

/punishments
- user (user)
View punishment history

--------------------------------------------------

RANK SYSTEM

/promote
- user (user)
- new_rank (role)
- reason (string)
Promote a user

/demote
- user (user)
- new_rank (role)
- reason (string)
Demote a user

/setrank
- user (user)
- new_rank (role)
- reason (string)
Force set rank

/rankhistory
- user (user)
View rank history

/promotionlog
Shows recent promotions

/demotionlog
Shows recent demotions

/who_promoted
- user (user)
See last rank change

--------------------------------------------------

EVENT SYSTEM

/event create
- name (string)
- time (string)
- host (user)

(event is created)

/event start
- name (string)

(event becomes active)

/event end
- name (string)

(event closes)

/event host
- event (string)
- user (user)

(change host)

/event attendee
- event (string)
- user (user)

(add attendee)

/event attendance
- event (string)

(view attendance)

/event history
- user (user)

(user event history)

/event leaderboard

(top hosts)

/event report
- event (string)

(full event report)

/event delete
- event (string)

(delete record)

--------------------------------------------------

REPORT SYSTEM

/report submit
- type (ranking / general / moderation / event)
- details (string)

(report created)

/report list

(list reports)

/report view
- caseid (string)

(view report)

/report assign
- caseid (string)
- staff (user)

(assign staff)

/report close
- caseid (string)
- result (string)

(close report)

/report reopen
- caseid (string)

(reopen report)

/report history
- user (user)

(user report history)

--------------------------------------------------

OVERRIDE MODE

Set:

OVERRIDE_MODE=yes

Only OWNER_DISCORD_ID can run commands
All other attempts are blocked and logged

--------------------------------------------------

LOGGING SYSTEM

Logs every command:
- User (name + ID)
- Role (name + ID)
- Command
- Options
- Channel
- Guild
- Override state
- Result (Allowed / Blocked / Error)
- Timestamp

--------------------------------------------------

STATUS

Fully modular
Production ready
Expandable

--------------------------------------------------
