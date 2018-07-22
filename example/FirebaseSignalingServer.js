firebase.initializeApp(secret);

phina.define("FirebaseSignalingServer", {
  superClass: "phina.rtc.ISignalingServer",

  id: null,
  database: null,

  init: function(id) {
    this.superInit();
    this.id = id;
    this.database = firebase.database();
  },

  startWaiting: function() {
    const ref = this.database.ref("hostPeer/" + this.id);
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
    });
  },

  stopWaiting: function() {
    const ref = this.database.ref("hostPeer/" + this.id);
    ref.remove();
    ref.off();
  },

  offer: function(peerId, sdp) {
    const ref = this.database.ref("hostPeer/" + peerId);
    return new Promise((resolve, reject) => {
      ref.once("value", (e) => {
        if (e.val()) {
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
    const ref = this.database.ref("hostPeer/" + peerId);
    ref.once("value", (e) => {
      const value = e.val();
      const clients = value.clients || [];
      const client = clients.find(_ => _.peerId == this.id);

      if (client) {
        clients.erase(client);
        value.clients = clients;
        ref.update(value);
        ref.off();
      }
    });
  },

  answer: function(peerId, sdp) {
    const ref = this.database.ref("hostPeer/" + this.id);
    ref.once("value", (e) => {
      const value = e.val();
      const clients = value.clients || [];
      const client = value.clients.find(_ => _.peerId == peerId);
      client.answerSdp = sdp;
      ref.update(value);
    });
  },
});

phina.rtc.Peer.signalingServerClassName = "FirebaseSignalingServer";