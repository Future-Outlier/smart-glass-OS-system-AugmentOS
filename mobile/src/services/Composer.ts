// orchestrates permissions, mini app lifecycle, mini app data fan out, etc.
// singleton pattern
// local mini apps will call the composer to request permissions
// ui layer will call the composer to start/stop local mini apps,
// mantle will call composer to feed data from the core (mic data)
class Composer {
  constructor() {
  }

  public loadLmas() {
   
  }

  public requestMic() {}

  public feedMicData(data: any) {
    
  }
}

const composer = new Composer()
export default composer
