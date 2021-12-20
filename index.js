require('dotenv').config();
var _ = require('lodash');
const { Bot, GrammyError, HttpError, BotError } = require('grammy');
const { Menu, MenuRange } = require('@grammyjs/menu');
const token = process.env.BOT_TOKEN;
const bot = new Bot(token);
const { User, Log, Day } = require('./models');
const mongoose = require('mongoose');
const { zonedTimeToUtc, utcToZonedTime, format } = require('date-fns-tz');
var parse = require('date-fns/parse');
var ObjectId = require('mongoose').Types.ObjectId;

// connect to worktime db with user dbuser
mongoose.connect(
    `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@mongo:27017/${process.env.DB_NAME}`
);

bot.command('start', (ctx) => ctx.reply('Welcome! Up and running.'));

// finnish month names for menu options
const months = [
    'Tammikuu',
    'Helmikuu',
    'Maaliskuu',
    'Huhtikuu',
    'Toukokuu',
    'Kesäkuu',
    'Heinäkuu',
    'Elokuu',
    'Syyskuu',
    'Lokakuu',
    'Marraskuu',
    'Joulukuu',
];

bot.command('aloita', async (ctx) => {
    const user = await User.findOne({ user: ctx.from.id });
    if (!user) {
        const newUser = new User({
            user: ctx.from.id,
            name: ctx.from.first_name,
        });
        await newUser.save();
        ctx.reply(`Tervetuloa ${ctx.from.first_name} !`);
    } else {
        ctx.reply(
            'Olet jo aloittanut botin käytön. Kirjaa tunnit /sisaan, /ulos tai /paiva'
        );
    }
});

bot.command('sisaan', async (ctx) => {
    const user = await User.findOne({ user: ctx.from.id });
    if (!user) {
        ctx.reply('Et ole aloittanut botin käyttöä, aloita komennolla /aloita');
        // check if the latest log is type in
    } else {
        const latestLog = await Log.findOne({
            user: user.id,
            type: 'automatic',
            out: { $exists: false },
        }).sort({
            in: -1,
        });
        if (latestLog) {
            ctx.reply('Olet jo kirjannut tänään sisään!');
        } else {
            const newLog = new Log({
                user: user.id,
                in: Date.now(),
                type: 'automatic',
            });
            await newLog.save();
            ctx.reply('Sisäänkirjaus lisätty');
        }
    }
});

bot.command('ulos', async (ctx) => {
    const user = await User.findOne({ user: ctx.from.id });
    if (!user) {
        ctx.reply('Käytä ensin /aloita komentoa');
    } else {
        const latestLog = await Log.findOne({
            user: user.id,
            out: { $exists: false },
            type: 'automatic',
        }).sort({
            in: -1,
        });
        if (!latestLog) {
            ctx.reply(
                'Vaikuttaa siltä, että unohdit kirjautua sisään tänään. Lisää tunnit manuaalisesti komennolla /paiva'
            );
        } else if (latestLog.in.getDate() !== new Date().getDate()) {
            ctx.reply(
                'Vaikuttaa siltä, että viimeinen sisäänkirjaus ei ole tältä päivältä. Kirjaa tunnit manuaalisesti komennolla /paiva'
            );
            ctx.reply('Poistin viimeisimmän sisäänkirjauksen: ' + latestLog.in);
            latestLog.remove();
        } else {
            latestLog.out = Date.now();
            await latestLog.save();
            ctx.reply('Uloskirjaus lisätty');
            // get the difference between the last log of type in and the current log of type out
            const diff = latestLog.out - latestLog.in;

            // TODO: count these properly :D
            const hours = Math.floor(diff / 1000 / 60 / 60);
            const minutes = Math.floor((diff / 1000 / 60) % 60);
            // new day
            const newDay = new Day({
                user: user.id,
                date: Date.now(),
                amount: hours,
            });
            await newDay.save();
            ctx.reply(
                `Teit työtä tänään ${hours} tuntia ja ${minutes} minuuttia!`
            );
        }
    }
});

bot.command('paiva', async (ctx) => {
    const user = await User.findOne({ user: ctx.from.id });
    console.log(ctx.message.text);
    if (!user) {
        ctx.reply('Käytä ensin /aloita komentoa');
    } else if (ctx.message.text.split(' ').length !== 3) {
        ctx.reply(
            'Komennon käyttö: /paiva <pvm muodossa 1.1.2021> <tunnit:minuutit>'
        );
    } else {
        const [hours, minutes] = ctx.message.text.split(' ')[2].split(':');
        const dateInput = ctx.message.text.split(' ')[1];
        const parsedDAte = parse(dateInput, 'd.M.yyyy', new Date(), {
            timeZone: 'Europe/Helsinki',
        });
        const StartTime = parsedDAte.setHours(0, 0, 0, 0);
        const EndTime = parsedDAte.setHours(hours, minutes, 0, 0);
        const newLog = new Log({
            user: user.id,
            // set in for start of current day
            in: StartTime,
            out: EndTime,
            type: 'manual',
        });
        await newLog.save();
        // convert hours and minutes to full hours
        const fullHours = Number(hours) + Number(minutes) / 60;
        const newDay = new Day({
            user: user.id,
            amount: fullHours,
            date: StartTime,
        });
        await newDay.save();
        ctx.reply(
            `Kirjattu manuaalisesti ${hours} tuntia ja ${minutes} minuuttia päivälle ${dateInput}`
        );
    }
});

const generateAllTimeReport = async (ctx) => {
    // generate report for current user in form month, year, hours, minutes
    const user = await User.findOne({ user: ctx.from.id });
    if (!user) {
        ctx.reply('Käytä ensin /aloita komentoa');
    } else {
        const days = await Day.find({ user: user.id });
        let report = [];
        // get all months where there is logs with year and month
        const months = _.uniqWith(
            days.map((day) => {
                return {
                    month: day.date.getMonth(),
                    year: day.date.getFullYear(),
                };
            }),
            _.isEqual
        );
        // for each month, count sum of hours in that month
        for (let i = 0; i < months.length; i++) {
            const month = months[i].month;
            const year = months[i].year;
            const daysInMonth = _.filter(days, (day) => {
                return (
                    day.date.getMonth() === month &&
                    day.date.getFullYear() === year
                );
            });
            const totalHours = _.sumBy(daysInMonth, 'amount');
            const hours = Math.floor(totalHours);
            const minutes = Math.round((totalHours - hours) * 60);
            report.push({
                month: month + 1,
                year: year,
                hours: hours,
                minutes: minutes,
            });
        }
        ctx.reply(
            `Kaikki tehdyt työt:\n${report
                .map(
                    (row) =>
                        `${row.month}/${row.year} ${row.hours}h ${row.minutes}m`
                )
                .join('\n')}`
        );
        ctx.menu.close();
    }
};

const generateReport = async (ctx, monthAndYear) => {
    const user = await User.findOne({ user: ctx.from.id });
    if (!user) {
        ctx.reply('Käytä ensin /aloita komentoa');
    } else {
        const daysForMonth = await Day.find({
            user: user.id,
            date: {
                $gte: new Date(monthAndYear.year, monthAndYear.month, 1),
                $lte: new Date(monthAndYear.year, monthAndYear.month + 1, 0),
            },
        });
        // return a array of objects with the day as key and the hours as value
        const report = _.groupBy(daysForMonth, (day) => {
            return new Date(day.date).getDate();
        });
        console.log(report);
        // return the report as a string
        const reportString = Object.keys(report).map((day) => {
            const amount = report[day][0].amount;
            console.log(amount);
            const hours = Math.floor(amount);
            const minutes = Math.round((amount - hours) * 60);
            const monthNumber = new Date(report[day][0].date).getMonth() + 1;
            return `${day}.${monthNumber}. ${hours}h ${minutes}min`;
        });

        const totalAmount = _.sumBy(daysForMonth, 'amount');
        const totalHours = Math.floor(totalAmount);
        const totalMinutes = Math.round((totalAmount - totalHours) * 60);

        ctx.reply(
            months[monthAndYear.month] +
                ' ' +
                monthAndYear.year +
                ':\n' +
                reportString.join('\n') +
                // total of hours in month
                '\n\n' +
                'Yhteensä: ' +
                totalHours +
                'h ' +
                totalMinutes +
                'min'
        );
        ctx.menu.close();
    }
};

const reportMenu = new Menu('select-month')
    .text('Kaikki', (ctx) => generateAllTimeReport(ctx))
    .row()
    .dynamic(async (ctx) => {
        const range = new MenuRange();
        const user = await User.findOne({ user: ctx.from.id });
        const days = await Day.find({ user: user.id });
        const monthsWithRecords = _.uniq(
            _.map(days, (day) => {
                return {
                    month: new Date(day.date).getMonth(),
                    year: new Date(day.date).getFullYear(),
                };
            })
        );
        // generate the menu
        _.forEach(monthsWithRecords, (monthAndYear) => {
            range
                .text(
                    months[monthAndYear.month] + ' ' + monthAndYear.year,
                    (ctx) => generateReport(ctx, monthAndYear)
                )
                .row();
        });
        return range;
    })
    .text('Cancel', (ctx) => ctx.deleteMessage());

bot.use(reportMenu);

bot.command('raportti', async (ctx) => {
    const user = await User.findOne({ user: ctx.from.id });
    if (!user) {
        ctx.reply('Käytä ensin /aloita komentoa');
    } else {
        // show the menu
        await ctx.reply('Valitse ajankohta:', { reply_markup: reportMenu });
    }
});

bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    ctx.reply('Sori, nyt meni jotain pieleen (kaaduin)');
    const e = err.error;
    if (e instanceof GrammyError) {
        console.error('Error in request:', e.description);
    } else if (e instanceof HttpError) {
        console.error('Could not contact Telegram:', e);
    } else {
        console.error('Unknown error:', e);
    }
});

bot.start();
console.log('Bot started');
