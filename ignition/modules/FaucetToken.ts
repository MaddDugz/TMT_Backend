import {buildModule} from "@nomicfoundation/hardhat-ignition/modules"

export default buildModule('FaucetModule', (m) => {
    const faucetToken = m.contract('FaucetToken')
    return {faucetToken}
})