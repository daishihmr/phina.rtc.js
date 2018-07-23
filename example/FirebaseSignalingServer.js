// Firebase Realtime Databaseを利用したシグナリングサーバー

phina.namespace(() => {
  firebase.initializeApp(secret);
  const database = firebase.database();

  phina.define("FirebaseSignalingServer", {
    superClass: "phina.rtc.ISignalingServer",

    id: null,
    database: null,

    init: function(id) {
      this.superInit();
      this.id = id;
    },

    startWaiting: function() {
      const ref = database.ref("hostPeer/" + this.id);
      ref.on("value", (e) => {
        const value = e.val();
        if (value == null) return;
        const clients = value.clients || [];
        clients
          .filter(_ => _.answerSdp == null)
          .forEach((c) => {
            this.flare("offer", { peerId: c.peerId, sdp: c.offerSdp })
          });
      });
      return ref.set({
        hostId: this.id,
        createdAt: Date.now(),
        clients: [],
        enabled: true,
      });
    },

    stopWaiting: function() {
      const ref = database.ref("hostPeer/" + this.id);
      ref.update({ enabled: false, createdAt: 0 });
      ref.off();
    },

    offer: function(peerId, sdp) {
      return new Promise((resolve, reject) => {
        const ref = database.ref("hostPeer/" + peerId);
        ref.once("value", (e) => {
          if (e.val() && e.val().enabled) {
            ref.on("value", (e) => {
              const value = e.val();
              if (value == null) return;

              const clients = value.clients || [];
              const client = clients.find(_ => _.peerId == this.id);

              if (!client) {
                clients.push({
                  peerId: this.id,
                  offerSdp: sdp,
                  answerSdp: null,
                });
                value.clients = clients;
                ref.update(value);
              } else if (client.answerSdp) {
                this.flare("answer", { peerId: peerId, sdp: client.answerSdp });
                ref.off();
              }
            });
            resolve();
          } else {
            reject(`peer(id = "${peerId}") is not waiting`);
          }
        });
      });
    },

    cancelOffer: function(peerId) {
      return new Promise(async(resolve) => {
        const ref = database.ref("hostPeer/" + peerId);
        ref.once("value", (e) => {
          const value = e.val();
          const clients = value.clients || [];
          const client = clients.find(_ => _.peerId == this.id);

          if (client) {
            clients.erase(client);
            value.clients = clients;
            await ref.update(value);
            await ref.off();
          }
          resolve();
        });
      });
    },

    answer: function(peerId, sdp) {
      return new Promise(async(resolve) => {
        const ref = database.ref("hostPeer/" + this.id);
        ref.once("value", (e) => {
          const value = e.val();
          const client = value.clients.find(_ => _.peerId == peerId);
          if (client) {
            client.answerSdp = sdp;
            await ref.update(value);
          }
          resolve();
        });
      });
    },
  });

  phina.rtc.Peer.signalingServerClassName = "FirebaseSignalingServer";

});
