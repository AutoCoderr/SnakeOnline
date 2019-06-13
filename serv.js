let http = require('http'),
    url = require('url'),
    fs = require('fs'),
    players = {},
    parties = [];
    playerSearching = {};

const hauteur = 30,
      largeur = 60,
      waitSpeed = 80,
      nbFruit = 2;

const server = http.createServer(function(req, res) { // --------------------------> LE SERVEUR HTTP <------------------------------------------------------
    let page = url.parse(req.url).pathname;
    const param = url.parse(req.url).query;
    if (page == "/") {
        page = "/index.html"
    } else if (page == "/socket.io/") {
        page = "/socket.io/socket.io.js"
    }
    page = __dirname + page
    const ext = page.split(".")[page.split(".").length-1]
    if (ext == "png" | ext == "jpg" | ext == "gif" | ext == "jpeg" | ext == "bmp" | ext == "tif" | ext == "tiff") {
       fs.readFile(page, function(error, content) {
         if(error){
           res.writeHead(404, {"Content-Type": "text/plain"});
           res.end("ERROR 404 : Page not found");
         } else {
           res.writeHead(200, {"Content-Type": "image/" + ext});
           res.end(content);
         }
      });
    } else {    
        fs.readFile(page, 'utf-8', function(error, content) {
           if(error){
             res.writeHead(404, {"Content-Type": "text/plain"});
             res.end("ERROR 404 : Page not found");
           } else {
                 if (page == "./serv.js") {
                     res.writeHead(404, {"Content-Type": "text/plain"});
                     res.end("ERROR 404 : Page not found");
                 } else {
                     res.writeHead(200, {"Content-Type": "text/html"});
                     res.end(content);
                 }
           }
      });
    }
});

const io = require('socket.io').listen(server);

io.sockets.on('connection', function (socket) {
    
    socket.on('login', function (pseudo) { // --------------------------------> LOGIN <--------------------------------------------
        if (typeof(socket.datas) != "undefined") {
            return;
        }
        let n = "";
        while(typeof(players[pseudo+n]) != "undefined") {
            if (n == "") {
                n = 2;
            } else {
                n += 1;
            }
        }
        pseudo = pseudo+n;
        players[pseudo] = {pseudo: pseudo, toAdd: 0, currentDirection: null, level: null, timeout: null, adversaire: null, playerType: null, serpent: [], 
                           socket: socket, demmanded: "", playing: false, timeLastProjectile: null, party: null};
        socket.datas = players[pseudo];
        console.log("new connected! : "+pseudo);
        socket.emit("newPseudo", pseudo)

        setTimeout(() => {
            let playersList = [];
            for (let unPseudo in players) {
                if (!players[unPseudo].playing) {
                    playersList.push(unPseudo);
                }
            }
            socket.emit("displayPlayers", playersList);
            socket.broadcast.emit("displayPlayers", playersList);
        },20);
    });

    socket.on('createParty', function () {
        if (socket.datas.party != null) {
            socket.emit("msg", {msg: "Vous ne pouvez pas lancer une nouvelle partie sans avoir stopper celle en cours", type: "error"});
            return;
        }

        socket.datas.party = {chef: socket.datas, participants: [], level: null, classement: [], voteForRestart: [], playing: false};
        parties.push(socket.datas.party);

        let partieList = [];

        for (let i=0;i<parties.length;i++) {
            if (!parties[i].playing) {
                partieList.push(parties[i].chef.pseudo);
            }
        }

        socket.broadcast.emit("displayParties", partieList);

        socket.emit('displayPlayersParty', {pseudo: socket.datas.pseudo, players: [socket.datas.pseudo]});
    });

    socket.on('cancelParty', function () {
        if (socket.datas.party.chef.pseudo == socket.datas.pseudo) {
            for (let i=0;i<parties.length;i++) {
                if (parties[i].chef.pseudo == socket.datas.pseudo) {
                    parties.splice(i,1);
                }
            }
            for (let i=0;i<socket.datas.party.participants.length;i++) {
                socket.datas.party.participants[i].socket.emit('quitParty');
                socket.datas.party.participants[i].party = null;
            }
            socket.datas.party = null;

            let playersList = [];
            for (let unPseudo in players) {
                if (!players[unPseudo].playing) {
                    playersList.push(unPseudo);
                }
            }
            socket.emit("displayPlayers", playersList);

            let partieList = [];

            for (let i=0;i<parties.length;i++) {
                if (!parties[i].playing) {
                    partieList.push(parties[i].chef.pseudo);
                }
            }
            socket.broadcast.emit("displayParties", partieList);
        } else {
            for (let i=0;i<socket.datas.party.participants.length;i++) {
                if (socket.datas.party.participants[i].pseudo == socket.datas.pseudo) {
                    socket.datas.party.participants.splice(i,1);
                    break;
                }
            }

            for (let i=0;i<socket.datas.party.classement.length;i++) {
                if (socket.datas.party.classement[i].pseudo == socket.datas.pseudo) {
                    socket.datas.party.classement.splice(i,1);
                    break;
                }
            }

             for (let i=0;i<socket.datas.party.voteForRestart.length;i++) {
                if (socket.datas.party.voteForRestart[i].pseudo == socket.datas.pseudo) {
                    socket.datas.party.voteForRestart.splice(i,1);
                    break;
                }
            }

            let playersList = [socket.datas.party.chef.pseudo];
            for (let i=0;i<socket.datas.party.participants.length;i++) {
                playersList.push(socket.datas.party.participants[i].pseudo);
            }

            socket.datas.party.chef.socket.emit('displayPlayersParty', {pseudo: socket.datas.party.chef.pseudo, players: playersList});

            for (let i=0;i<socket.datas.party.participants.length;i++) {
                 socket.datas.party.participants[i].socket.emit('displayPlayersParty', {pseudo: socket.datas.party.chef.pseudo, players: playersList});
            }

            socket.datas.party = null;

            socket.emit("quitParty");

        }
    });

    socket.on('startParty', function () {
        if (typeof(socket.datas) == "undefined") {
            return;
        } else if (socket.datas.party == null) {
            socket.emit("msg", {msg: "Vous n'avez créer aucune partie", type: "error"});
            return;
        } else if (socket.datas.party.chef.pseudo != socket.datas.pseudo) {
            socket.emit("msg", {msg: "Vous n'êtes pas le chef de la partie dans laquelle vous êtes actuellement", type: "error"});
            return;
        } else if (socket.datas.party.participants.length == 0) {
            socket.emit("msg", {msg: "Il doit y avoir minimum 2 personne pour que la partie puisse commencer", type: "error"});
            return;
        }

        startGame(null, null, socket.datas.party);
    });

    socket.on('listParties', function () {
        let partieList = [];

        for (let i=0;i<parties.length;i++) {
            if (!parties[i].playing) {
                partieList.push(parties[i].chef.pseudo);
            }
        }

        socket.emit("displayParties", partieList);
    });

    socket.on('joinParty', function (pseudo) {
        if (typeof(socket.datas) == "undefined") {
            return;
        }
        if (socket.datas.party != null) {
            socket.emit("msg", {msg: "Vous ne pouvez pas rejoindre une nouvelle partie sans avoir stopper celle en cours", type: "error"});
            return;
        }
        if (typeof(players[pseudo]) == "undefined") {
            socket.emit("msg", {msg: "Cette partie n'existe pas", type: "error"});
            return;
        } else if (players[pseudo].party == null) {
            socket.emit("msg", {msg: "Cette partie n'existe pas", type: "error"});
            return;
        }

        if (players[pseudo].party.playing) {
            socket.emit("msg", {msg: "Partie déjà en cours", type: "error"});
            return;
        }

        if (players[pseudo].party.participants.length == 3) {
            socket.emit("msg", {msg: "Il n'y pas de place pour vous", type: "error"});
            return;
        }

        socket.datas.party = players[pseudo].party;

        players[pseudo].party.participants.push(socket.datas);

        let playersList = [players[pseudo].party.chef.pseudo];
        for (let i=0;i<players[pseudo].party.participants.length;i++) {
            playersList.push(players[pseudo].party.participants[i].pseudo);
        }

        players[pseudo].socket.emit('displayPlayersParty', {pseudo: pseudo, players: playersList});

        for (let i=0;i<players[pseudo].party.participants.length;i++) {
             players[pseudo].party.participants[i].socket.emit('displayPlayersParty', {pseudo: pseudo, players: playersList});
        }

    });

    socket.on('voteToRestart', function () {
        if (typeof(socket.datas) == "undefined") {
            return;
        }
        if (socket.datas.party == null) {
            socket.emit("msg", {msg: "Vous n'êtes dans aucune partie", type: "error"});
            return;
        }

        if (socket.datas.party.chef.pseudo == socket.datas.pseudo) {
            socket.emit("msg", {msg: "Vous êtes le créateur de cette partie, par concequent vous êtes obligé de continuer à jouer", type: "error"});
            return;
        }

        for (let i=0;i<socket.datas.party.voteForRestart.length;i++) {
            if (socket.datas.party.voteForRestart[i].pseudo == socket.datas.pseudo) {
                return;
            }
        }

        socket.datas.party.voteForRestart.push(socket.datas);

        socket.datas.party.chef.socket.emit("newVoteToRestart", socket.datas.party.voteForRestart.length);

        for (let i=0;i<socket.datas.party.participants.length;i++) {
            socket.datas.party.participants[i].socket.emit("newVoteToRestart", socket.datas.party.voteForRestart.length);
        }
    });

    socket.on('displayPlayers', function () {
        let playersList = [];
        for (let unPseudo in players) {
            if (!players[unPseudo].playing) {
                playersList.push(unPseudo);
            }
        }
        socket.emit("displayPlayers", playersList);
    });

    socket.on("acceptDemmand", function(pseudo) {
        if (typeof(socket.datas) == "undefined") {
            socket.emit("msg", {msg: "Le serveur à été relancé, veuillez actualiser", type: "error"});
            return;
        }

        if (typeof(players[pseudo]) == "undefined") {
            socket.emit("msg", {msg: "Ce joueur n'existe pas", type: "error"});
        } else if (players[pseudo].demmanded != socket.datas.pseudo) {
            socket.emit("msg", {msg: "Cet utilisateur ne vous a jamais envoyé de demmande", type: "error"}); 
        } else {
            players[pseudo].demmanded = "";
            startGame(players[pseudo],socket.datas);
        }
    });
    
    socket.on('sendDemmand', function(pseudo) {
        if (typeof(socket.datas) == "undefined") {
            socket.emit("msg", {msg: "Le serveur à été relancé, veuillez actualiser", type: "error"});
            return;
        }

        if (typeof(players[pseudo]) == "undefined") {
            socket.emit("msg", {msg: "Ce joueur n'existe pas", type: "error"});
        } else if (players[pseudo].playing) {
            socket.emit("msg", {msg: "Ce joueur est dans une partie", type: "error"});
        } else {
            socket.datas.demmanded = pseudo;
            players[pseudo].socket.emit("demmand", socket.datas.pseudo);
        }
    });

    socket.on('deplace', function(direction) {
        if (typeof(socket.datas) == "undefined") {
            return;
        } else if (!socket.datas.playing) {
            return;
        }
        let currentDirection = socket.datas.currentDirection;
        if (((direction == "haut" | direction == "bas") & (currentDirection == "haut" | currentDirection == "bas")) |
            ((direction == "gauche" | direction == "droite") & (currentDirection == "gauche" | currentDirection == "droite")) |
            (direction != "gauche" & direction != "droite" & direction != "haut" & direction != "bas")) {
            return;
        }
        socket.datas.currentDirection = direction;
        if (socket.datas.timeout != null) {
            clearTimeout(socket.datas.timeout);
            socket.datas.timeout = null;
        }
        switch(direction) {
            case "haut":
                deplaceRec(-1,0,socket.datas);
                break;
            case "bas":
                deplaceRec(1,0,socket.datas);
                break;
            case "gauche":
                deplaceRec(0,-1,socket.datas);
                break;
            case "droite":
                deplaceRec(0,1,socket.datas);
                break;

        }
    });

    socket.on('projectile', function() {
        if (typeof(socket.datas) == "undefined") {
            return;
        } else if (!socket.datas.playing) {
            return;
        }

        if (socket.datas.timeLastProjectile != null) {
            if (new Date().getTime() - socket.datas.timeLastProjectile < 1000) {
                return;
            }
        }

        sendProjectile(socket.datas);
    });

    socket.on('searchPlayer', function() {
        if (typeof(socket.datas) == "undefined") {
            return;
        }
        playerSearching[socket.datas.pseudo] = socket.datas;
        for (let unPseudo in playerSearching) {
            if (unPseudo != socket.datas.pseudo) {
                delete playerSearching[unPseudo];
                delete playerSearching[socket.datas.pseudo];
                startGame(socket.datas,players[unPseudo]);
                break;
            }
        }
    });

    socket.on("stopSearch", function () {
        delete playerSearching[socket.datas.pseudo];
    });

    socket.on('disconnect', function() { // ----------------------> DECONNEXION D'UN CLIENT <---------------------------------------
        if (typeof(socket.datas) != "undefined") {
            if (socket.datas.timeout != null) {
                clearTimeout(socket.datas.timeout);
            }
            if (socket.datas.adversaire != null) {
                socket.datas.adversaire.adversaire = null;
                if (socket.datas.adversaire.timeout != null) {
                    cleartimeout(socket.datas.adversaire.timeout);
                }
                socket.datas.adversaire.playing = false;
                socket.datas.adversaire.socket.emit("endGame", {place: 1, nbPlayer: 2});
                socket.datas.adversaire.serpent = [];
                socket.datas.adversaire.playerType = "";
                socket.datas.adversaire.currentDirection = "";
                socket.datas.adversaire.level = null;
                socket.datas.adversaire.toAdd = 0;
                socket.datas.adversaire.timeout = null;
            } else if (socket.datas.party != null) {
                let player = socket.datas;

                if (player.party.chef.pseudo != player.pseudo) {
                    player.party.chef.socket.emit("msg", {msg: socket.datas.pseudo+" a quitté la partie", type: "info"});

                    for (let i=0;i<player.party.participants.length;i++) {
                        if (player.party.participants[i].pseudo == socket.datas.pseudo) {
                            player.party.participants.splice(i,1);
                            i -= 1;
                        } else {
                            player.party.participants[i].socket.emit("msg", {msg: socket.datas.pseudo+" a quitté la partie", type: "info"});
                        }
                    }
                    for (let i=0;i<player.party.classement.length;i++) {
                        if (player.party.classement[i].pseudo == socket.datas.pseudo) {
                            player.party.classement.splice(i,1);
                            break;
                        }
                    }
                    for (let i=0;i<player.party.voteForRestart.length;i++) {
                        if (player.party.voteForRestart[i].pseudo == socket.datas.pseudo) {
                            player.party.voteForRestart.splice(i,1);
                            break;
                        }
                    }
                } else {
                    for (let i=0;i<parties.length;i++) {
                        if (parties[i].chef.pseudo == socket.datas.pseudo) {
                            parties.splice(i,1);
                        }
                    }
                    for (let i=0;i<socket.datas.party.participants.length;i++) {
                        player.party.participants[i].socket.emit('quitParty');
                        player.party.participants[i].party = null;
                        player.party.participants[i].playing = false;
                        if (player.party.participants[i].timeout != null) {
                            clearTimeout(player.party.participants[i].timeout);
                        }
                        player.party.participants[i].level = null;
                        player.party.participants[i].serpent = [];
                        player.party.participants[i].currentDirection = "";
                        player.party.participants[i].playerType = "";
                        player.party.participants[i].toAdd = 0;
                    }
                    player.party = null;

                    let partieList = [];

                    for (let i=0;i<parties.length;i++) {
                        if (!parties[i].playing) {
                            partieList.push(parties[i].chef.pseudo);
                        }
                    }

                    socket.broadcast.emit("displayParties", partieList);
                }

            }
            const pseudo = socket.datas.pseudo;
            if (typeof(playerSearching[pseudo]) != "undefined") {
                delete playerSearching[pseudo];
            }
            console.log("delete "+pseudo);
            delete players[pseudo];
            let playersList = [];
            for (let pseudo in players) {
                if (!players[pseudo].playing) {
                    playersList.push(pseudo);
                }
            }
            socket.broadcast.emit("displayPlayers", playersList);
        }
    });
});

function logListPlayer() {
    let str = "";
    for (let pseudo in players) {
        str += pseudo+" ; ";
    }
    console.log(str.slice(0,str.length-3));
}

function deplaceRec(coefL, coefC, player) {
    let tab = player.level;
    let serpent = player.serpent;

    let l1 = serpent[0].l+coefL,
        c1 = serpent[0].c+coefC;
    let collision = false;
    if (tab[l1][c1] != 0 & tab[l1][c1] != 2) {
        collision = true;
    } else if (tab[l1][c1] == 2) {
        player.toAdd = 5;
        let randomL = Math.round(Math.random()*(tab.length-1));
        let randomC = Math.round(Math.random()*(tab[0].length-1));
        while (tab[randomL][randomC] != 0) {
            randomL = Math.round(Math.random()*(tab.length-1));
            randomC = Math.round(Math.random()*(tab[0].length-1));
        }
        tab[randomL][randomC] = 2
    }
    for (let i=0;i<serpent.length;i++) {
        let l2 = serpent[i].l,
            c2 = serpent[i].c;

        //tab[l1][c1] = tab[l2][c2];
        if (i+1 % 7 == 6 | i+1 % 7 == 0) {
            switch (player.playerType) {
                case "J1":
                    tab[l1][c1] = 12;
                    break;
                case "J2":
                    tab[l1][c1] = 11;
                    break;
                case "J3":
                    tab[l1][c1] = 14;
                    break;
                case "J4": 
                    tab[l1][c1] = 13;
                    break;
            }
        } else {
             switch (player.playerType) {
                case "J1":
                    tab[l1][c1] = 11;
                    break;
                case "J2":
                    tab[l1][c1] = 12;
                    break;
                case "J3":
                    tab[l1][c1] = 13;
                    break;
                case "J4": 
                    tab[l1][c1] = 14;
                    break;
            }
        }
        tab[l2][c2] = 0;
        serpent[i].l = l1;
        serpent[i].c = c1;
        l1 = l2;
        c1 = c2;
    }
    if (player.toAdd > 0) {
        player.toAdd -= 1;
        serpent.push({l: l1, c: c1, id: serpent.length});
        if (serpent.length % 7 == 6 | serpent.length % 7 == 0) {
            switch (player.playerType) {
                case "J1":
                    tab[l1][c1] = 12;
                    break;
                case "J2":
                    tab[l1][c1] = 11;
                    break;
                case "J3":
                    tab[l1][c1] = 14;
                    break;
                case "J4": 
                    tab[l1][c1] = 13;
                    break;
            }
        } else {
             switch (player.playerType) {
                case "J1":
                    tab[l1][c1] = 11;
                    break;
                case "J2":
                    tab[l1][c1] = 12;
                    break;
                case "J3":
                    tab[l1][c1] = 13;
                    break;
                case "J4": 
                    tab[l1][c1] = 14;
                    break;
            }
        }
    }
    if (collision) {
        tab[serpent[0].l][serpent[0].c] = 4;
        if (player.party == null & player.adversaire != null) {
            player.socket.emit("displayLevel", {tab: tab, score: serpent.length, playerType: player.playerType});
            player.adversaire.socket.emit("displayLevel", {tab: tab, score: player.adversaire.serpent.length, playerType: player.adversaire.playerType});
        } else {
            player.party.chef.socket.emit("displayLevel", {tab: tab, score: player.party.chef.serpent.length, playerType: "J1"});
            for (let i=0;i<player.party.participants.length;i++) {
                player.party.participants[i].socket.emit("displayLevel", {tab: tab, score: player.party.participants[i].serpent.length, playerType: player.party.participants[i].playerType});
            }
        }
        gameOver(player);
        return;
    }

    if (player.party == null) {
        player.socket.emit("displayLevel", {tab: tab, score: serpent.length, playerType: player.playerType});
        player.adversaire.socket.emit("displayLevel", {tab: tab, score: player.adversaire.serpent.length, playerType: player.adversaire.playerType});
    } else {
        player.party.chef.socket.emit("displayLevel", {tab: tab, score: player.party.chef.serpent.length, playerType: "J1"});
        for (let i=0;i<player.party.participants.length;i++) {
            player.party.participants[i].socket.emit("displayLevel", {tab: tab, score: player.party.participants[i].serpent.length, playerType: player.party.participants[i].playerType});
        }
    }

    player.timeout = setTimeout(() => {
        deplaceRec(coefL, coefC, player);
    },waitSpeed);
}

function sendProjectile(player) {

    if (player.serpent.length < 6) {
        return;
    }

    /*for (let i=player.serpent.length-5;i<player.serpent.length;i++) {
        player.level[player.serpent[i].l][player.serpent[i].c] = 0;
    }
    player.serpent = player.serpent.slice(0,player.serpent.length-5);*/

    let coefL;
    let coefC;

    switch (player.currentDirection) {
        case "haut":
            coefL = -1;
            coefC = 0;
            break;
        case "bas":
            coefL = 1;
            coefC = 0;
            break;
        case "gauche":
            coefL = 0;
            coefC = -1;
            break;
        case "droite":
            coefL = 0;
            coefC = 1;
            break;
    }

    let projectileNumber = 10+parseInt(player.playerType[1]);

    let projectile = []

    for (let i=4;i>=0;i--) {
        projectile.push({l: player.serpent[0].l+coefL*3+coefL*i, c: player.serpent[0].c+coefC*3+coefC*i});
        if (projectile[projectile.length-1].l < 0 | projectile[projectile.length-1].l > hauteur-1 | 
            projectile[projectile.length-1].c < 0 | projectile[projectile.length-1].c > largeur-1) {
            return;
        }
        player.level[projectile[projectile.length-1].l][projectile[projectile.length-1].c] = projectileNumber;
        player.level[player.serpent[player.serpent.length-1].l][player.serpent[player.serpent.length-1].c] = 0;
        player.serpent = player.serpent.slice(0,player.serpent.length-1);
    }

    player.timeLastProjectile = new Date().getTime();

    lanceProjectileRec(projectile, coefL, coefC, player.level, player);
}

function lanceProjectileRec(projectile, coefL, coefC, level, player) {
    if (player.adversaire == null & player.party == null) {
        return;
    }
    verifFruit(level);
    let l1 = projectile[0].l+coefL;
    let c1 = projectile[0].c+coefC;
    if (l1 < 0 | l1 > hauteur-1 | c1 < 0 | c1 > largeur-1) {
        return;
    } else if (level[l1][c1] != 0 & level[l1][c1] != 2) {
        return;
    } //else if (level[l1][c1] == 2) {
        /*let randomL = Math.round(Math.random()*(level.length-1));
        let randomC = Math.round(Math.random()*(level[0].length-1));

        let CForbidStart = projectile[0].c;
        let CForbidEnd;
        if (coefC > 0) {
            CForbidEnd = largeur-1;
        } else if (coefC < 0) {
            CForbidEnd = 0;
        } else {
            CForbidEnd = projectile[0].c;
        }

        let LForbidStart = projectile[0].l;
        let LForbidEnd;
        if (coefL > 0) {
            LForbidEnd = hauteur-1;
        } else if (coefL < 0) {
            LForbidEnd = 0;
        } else {
            LForbidEnd = projectile[0].l;
        }

        while (level[randomL][randomC] != 0 | ((LForbidStart <= randomL & randomL <= LForbidEnd) & (CForbidStart <= randomC & randomC <= CForbidEnd))) {
            randomL = Math.round(Math.random()*(level.length-1));
            randomC = Math.round(Math.random()*(level[0].length-1));
        }
        level[randomL][randomC] = 2;*/
   // }

    for (let i=0;i<projectile.length;i++) {
        let l2 = projectile[i].l;
        let c2 = projectile[i].c;

        level[l1][c1] = level[l2][c2];
        level[l2][c2] = 0;

        projectile[i].l = l1;
        projectile[i].c = c1;

        l1 = l2;
        c1 = c2;
    }

    if (player.party == null) {
        player.socket.emit("displayLevel", {tab: level, score: player.serpent.length, playerType: player.playerType});
        player.adversaire.socket.emit("displayLevel", {tab: level, score: player.adversaire.serpent.length, playerType: player.adversaire.playerType});
    } else {
        player.party.chef.socket.emit("displayLevel", {tab: level, score: player.party.chef.serpent.length, playerType: "J1"});
        for (let i=0;i<player.party.participants.length;i++) {
            player.party.participants[i].socket.emit("displayLevel", {tab: level, score: player.party.participants[i].serpent.length, playerType: player.party.participants[i].playerType});
        }
    }

    setTimeout(() => {
        lanceProjectileRec(projectile, coefL, coefC, level, player);
    }, 20);

}

function verifFruit(tab) {
    let fruitFound = 0
    for (let l=0;l<tab.length;l++) {
        for (let c=0;c<tab[l].length;c++) {
            if (tab[l][c] == 2) {
                fruitFound += 1;
            }
        }
    }
    if (fruitFound < nbFruit) {
        for (let i=0;i<nbFruit-fruitFound;i++) {
            let randomL = Math.round(Math.random()*(tab.length-1));
            let randomC = Math.round(Math.random()*(tab[0].length-1));
            while (tab[randomL][randomC] != 0) {
                randomL = Math.round(Math.random()*(tab.length-1));
                randomC = Math.round(Math.random()*(tab[0].length-1));
            }
            tab[randomL][randomC] = 2
        }
    }
}

function gameOver(player) {
    if (!player.playing) {
        return;
    }
    if (player.party == null) {
        if (player.adversaire.timeout != null) {
            clearTimeout(player.adversaire.timeout);
            player.adversaire.timeout = null;
        }
        player.timeout = null;

        player.playing = false;
        player.adversaire.playing = false;

        player.serpent = [];
        player.adversaire.serpent = [];

        player.playerType = "";
        player.adversaire.playerType = "";

        player.currentDirection = "";
        player.adversaire.currentDirection = "";

        player.level = null;
        player.adversaire.level = null;

        player.toAdd = 0;
        player.adversaire.toAdd = 0;

        player.socket.emit("endGame", {place: 2, nbPlayer: 2, canVote: false});
        player.adversaire.socket.emit("endGame", {place: 1, nbPlayer: 2, canVote: false});

        player.adversaire.adversaire = null;
        player.adversaire = null;
    } else {
        player.timeout = null;

        player.playing = false;

        player.serpent = [];

        player.currentDirection = "";

        player.level = null;

        player.toAdd = 0;

        player.party.classement.push(player);

        player.socket.emit("endGame", {place: (player.party.participants.length+1)-(player.party.classement.length-1), nbPlayer: player.party.participants.length+1, canVote: false, pseudo: player.party.chef.pseudo});

        let dieds = diedPlayers(player.party);
        
        if (dieds.length == player.party.participants.length) {
            let theOnlySurvivor = getTheOnlySurvivor(player.party);
            theOnlySurvivor.playing = false;
            if (theOnlySurvivor.timeout != null) {
                clearTimeout(theOnlySurvivor.timeout);
                theOnlySurvivor.timeout = null;
            }
            theOnlySurvivor.playing = false;
            theOnlySurvivor.serpent = [];
            theOnlySurvivor.currentDirection = "";
            theOnlySurvivor.level = null;
            theOnlySurvivor.toAdd = 0;
            player.party.classement.push(theOnlySurvivor);

            for (let i=0;i<player.party.classement.length;i++) {
                player.party.classement[i].socket.emit("endGame", {place: (player.party.participants.length+1)-i, nbPlayer: player.party.participants.length+1, canVote: true, pseudo: player.party.chef.pseudo});
            }

            timeoutAfterMatchRec(player.party, 10);
        } else {
            let str = "";

            for (let i=0;i<dieds.length;i++) {
                if (i == dieds.length-1 & i > 0) {
                    str += " et"
                }
                if (i > 0) {
                    str += " "
                }
                str += dieds[i];
            }
            if (dieds.length > 1) {
                str += " sont morts";
            } else if (dieds.length == 1) {
                str += " est mort";
            }

            player.party.chef.socket.emit("msg", {msg: str, type: "info"});

            for (let i=0;i<player.party.participants.length;i++) {
                player.party.participants[i].socket.emit("msg", {msg: str, type: "info"});
            }
        }
    }
}

function getTheOnlySurvivor(party) {
    if (party.chef.playing) {
        return party.chef;
    }

    for (let i=0;i<party.participants.length;i++) {
       if (party.participants[i].playing) {
           return party.participants[i];
       }
    }

}

function diedPlayers(party) {
    let dieds = [];
    if (!party.chef.playing) {
        dieds.push(party.chef.pseudo);
    }

    for (let i=0;i<party.participants.length;i++) {
        if (!party.participants[i].playing) {
            dieds.push(party.participants[i].pseudo);
        }
    }

    return dieds;
}

function timeoutAfterMatchRec(party, sec) {
    party.chef.socket.emit("timeout", sec);

    for (let i=0;i<party.participants.length;i++) {
        party.participants[i].socket.emit("timeout", sec);
    }

    if (sec == 0) {
        applyVote(party);
        return
    }

    setTimeout(() => {
        timeoutAfterMatchRec(party, sec-1);
    }, 1000);
}

function applyVote(party) {
    if (party.voteForRestart.length == 0) {
        return;
    }

    for (let i=0;i<party.participants.length;i++) {
        if (!hasVoted(party.participants[i], party.voteForRestart)) {
            party.participants[i].socket.emit("quitParty");
            party.participants[i].party = null;
            party.participants.splice(i,1);
            i -= 1;
        }
    }

    party.classement = [];
    party.voteForRestart = [];
    party.level = null;

    startGame(null, null, party);

}

function hasVoted(player, vote) {
    for (let i=0;i<vote.length;i++) {
        if (vote[i].pseudo == player.pseudo) {
            return true;
        }
    }
    return false;
}


function startGame(J1,J2, party) {
    if (party == null) {
        J1.playing = true;
        J2.playing = true;
        let tab = [];
        for (let l=0;l<hauteur;l++) {
            tab.push([]);
            for (let c=0;c<largeur;c++) {
                if (l == 0 | l == hauteur-1 | c == 0 | c == largeur-1) {
                    tab[l].push(3);
                } else {
                    tab[l].push(0);
                }
            }
        }

        let randomL = Math.round(Math.random()*(tab.length-1));
        let randomC = Math.round(Math.random()*(tab[0].length-1));
        while (tab[randomL][randomC] != 0) {
            randomL = Math.round(Math.random()*(tab.length-1));
            randomC = Math.round(Math.random()*(tab[0].length-1));
        }
        tab[randomL][randomC] = 11;

        J1.serpent = [{l: randomL, c: randomC, id: 0}];

        randomL = Math.round(Math.random()*(tab.length-1));
        randomC = Math.round(Math.random()*(tab[0].length-1));
        while (tab[randomL][randomC] != 0) {
            randomL = Math.round(Math.random()*(tab.length-1));
            randomC = Math.round(Math.random()*(tab[0].length-1));
        }
        tab[randomL][randomC] = 12

        J2.serpent = [{l: randomL, c: randomC, id: 0}];

        for (let i=0;i<nbFruit;i++) {
            randomL = Math.round(Math.random()*(tab.length-1));
            randomC = Math.round(Math.random()*(tab[0].length-1));
            while (tab[randomL][randomC] != 0) {
                randomL = Math.round(Math.random()*(tab.length-1));
                randomC = Math.round(Math.random()*(tab[0].length-1));
            }
            tab[randomL][randomC] = 2
        }

        J1.level = tab;
        J2.level = tab;

        J1.adversaire = J2;
        J2.adversaire = J1;

        J1.playerType = "J1";
        J2.playerType = "J2";

        J1.socket.emit("displayLevel", {tab: tab, score: J1.serpent.length, playerType: "J1"});
        J2.socket.emit("displayLevel", {tab: tab, score: J2.serpent.length, playerType: "J2"});
    } else {
        party.playing = true;

        party.chef.playing = true;
        for (let i=0;i<party.participants.length;i++) {
            party.participants[i].playing = true;
        }
        let tab = [];

        for (let l=0;l<hauteur;l++) {
           tab.push([]);
           for (let c=0;c<largeur;c++) {
               if (l == 0 | l == hauteur-1 | c == 0 | c == largeur-1) {
                   tab[l].push(3);
               } else {
                   tab[l].push(0);
               }
           }
        }

        let randomL = Math.round(Math.random()*(tab.length-1));
        let randomC = Math.round(Math.random()*(tab[0].length-1));
        while (tab[randomL][randomC] != 0) {
            randomL = Math.round(Math.random()*(tab.length-1));
            randomC = Math.round(Math.random()*(tab[0].length-1));
        }
        tab[randomL][randomC] = 11;

        party.chef.serpent = [{l: randomL, c: randomC, id: 0}];

        for (let i=0;i<party.participants.length;i++) {
            randomL = Math.round(Math.random()*(tab.length-1));
            randomC = Math.round(Math.random()*(tab[0].length-1));
            while (tab[randomL][randomC] != 0) {
                randomL = Math.round(Math.random()*(tab.length-1));
                randomC = Math.round(Math.random()*(tab[0].length-1));
            }
            tab[randomL][randomC] = 10+(i+2);
            party.participants[i].serpent = [{l: randomL, c: randomC, id: 0}];
        }

        for (let i=0;i<party.participants.length+1;i++) {
            randomL = Math.round(Math.random()*(tab.length-1));
            randomC = Math.round(Math.random()*(tab[0].length-1));
            while (tab[randomL][randomC] != 0) {
                randomL = Math.round(Math.random()*(tab.length-1));
                randomC = Math.round(Math.random()*(tab[0].length-1));
            }
            tab[randomL][randomC] = 2
        }

        party.chef.level = tab;

        for (let i=0;i<party.participants.length;i++) {
            party.participants[i].level = tab;
        }

        party.chef.playerType = "J1";

        for (let i=0;i<party.participants.length;i++) {
            party.participants[i].playerType = "J"+(i+2);
        }

        party.chef.socket.emit("displayLevel", {tab: tab, score: party.chef.serpent.length, playerType: "J1"});

        for (let i=0;i<party.participants.length;i++) {
            party.participants[i].socket.emit("displayLevel", {tab: tab, score: party.participants[i].serpent.length, playerType: "J"+(i+2)});
        }

    }
}

server.listen(3000);