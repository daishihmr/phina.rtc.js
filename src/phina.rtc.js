phina.namespace(() => {

  /**
   * @interface
   */
  phina.define("phina.rtc.ISignalingServer", {
    superClass: "phina.util.EventDispatcher",

    init: function(id) {
      this.superInit();
    },

    /**
     * publish peer id
     */
    startWaiting: function() {},

    /**
     * unpublish peer id
     */
    stopWaiting: function() {},

    /**
     * send offer sdp to another peer
     */
    offer: function(peerId, sdp) {},

    /**
     * send answer sdp to another peer
     */
    answer: function(peerId, sdp) {},

    /**
     * Event
     */
    onoffer: function(e) {
      const peerId = e.peerId;
      const offerSdp = e.sdp;
    },

    /**
     * Event
     */
    onanswer: function(e) {
      const peerId = e.peerId;
      const answerSdp = e.sdp;
    },
  });

  phina.define("phina.rtc.Peer", {
    superClass: "phina.util.EventDispatcher",

    _static: {
      signalingServerClassName: "phina.rtc.ISignalingServer",
    },

    signalingServer: null,
    id: null,
    connections: null,
    waiting: false,

    init: function(peerId) {
      this.superInit();

      this.id = peerId || phina.util.Random.uuid();
      this.connections = {};

      this.signalingServer = this._createSignalingServer();
    },

    startWaiting: function() {
      this.signalingServer.startWaiting();
      this.waiting = true;
      return this;
    },

    stopWaiting: function() {
      this.signalingServer.stopWaiting();
      this.waiting = false;
      return this;
    },

    /**
     * create DataChannel connection
     */
    connect: function(peerId) {
      return new Promise(async(resolve, reject) => {
        try {
          const conn = phina.rtc.Connection(peerId);

          const sdp = await conn._createOffer();
          await this.signalingServer.offer(peerId, sdp);

          conn.one("open", () => {
            this.connections[peerId] = conn;
            resolve(conn);
          });
        } catch (err) {
          reject(err);
        }
      });
    },

    _createSignalingServer: function() {
      const SignalingServer = phina.using(phina.rtc.Peer.signalingServerClassName);
      const signalingServer = SignalingServer(this.id);

      signalingServer.on("offer", async(e) => {
        const peerId = e.peerId;
        const offerSdp = e.sdp;

        const conn = phina.rtc.Connection(peerId);
        const answerSdp = await conn._receiveOffer(offerSdp);
        await signalingServer.answer(peerId, answerSdp);

        conn.one("open", () => {
          this.connections[peerId] = conn;
          this.flare("connection", { peerId: peerId, connection: conn });
        });
      });

      signalingServer.on("answer", (e) => {
        const peerId = e.peerId;
        const answerSdp = e.sdp;

        const conn = this.connections[peerId];
        conn._receiveAnswer(answerSdp);
      });

      return signalingServer;
    },
  });

  phina.define("phina.rtc.Connection", {
    superClass: "phina.util.EventDispatcher",

    remoteId: null,
    opened: false,

    _connection: null,
    _dataChannel: null,

    init: function(remoteId) {
      this.superInit();

      this.remoteId = remoteId;
      this.opened = false;

      this._connection = new RTCPeerConnection();
      this._connection.onicecandidate = (e) => {
        if (e.candidate == null) this.flare("icecandidate");
      };
    },

    send: function(data) {
      this._dataChannel.send(data);
    },

    close: function() {
      this._connection.close();
    },

    _createOffer: function() {
      return new Promise(async(resolve, reject) => {
        try {
          this.one("icecandidate", () => {
            resolve(this._connection.localDescription.sdp);
          });

          this._dataChannel = this._connection.createDataChannel("_dataChannel");
          this._setupDataChannel();

          const offer = await this._connection.createOffer();
          await this._connection.setLocalDescription(offer);
        } catch (err) {
          reject(err);
        }
      });
    },

    _receiveOffer: function(sdp) {
      this._connection.ondatachannel = (e) => {
        this._dataChannel = e.channel;
        this._setupDataChannel();
      };

      return new Promise(async(resolve, reject) => {
        try {
          this.one("icecandidate", () => {
            resolve(this._connection.localDescription.sdp);
          });

          this._connection.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: sdp }));
          const answer = await this._connection.createAnswer();
          await this._connection.setLocalDescription(answer);
        } catch (err) {
          reject(err);
        }
      });
    },

    _receiveAnswer: function(sdp) {
      this._connection.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: sdp }));
    },

    _setupDataChannel: function() {
      this._dataChannel.onopen = (e) => {
        this.opened = true;
        this.flare("open");
      };
      this._dataChannel.onmessage = (e) => {
        this.flare("message", { data: e.data });
      };
      this._dataChannel.onclose = (e) => {
        this.opened = false;
        this.flare("close");
      };
    },
  });

});