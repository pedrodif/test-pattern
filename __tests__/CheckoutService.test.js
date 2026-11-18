import { CheckoutService } from '../src/services/CheckoutService.js'
import { Pedido } from '../src/domain/Pedido.js'
import { Item } from '../src/domain/Item.js'
import { UserMother } from './builders/UserMother.js'
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js'

const CARTAO = '4111-1111-1111-1111'

const criarGatewayStub = (success) => ({
    cobrar: jest.fn().mockResolvedValue({ success }),
})

const criarRepositoryStub = (carrinho, totalFinal) => ({
    salvar: jest.fn().mockResolvedValue(new Pedido(1, carrinho, totalFinal, 'PROCESSADO')),
})

const criarEmailMock = () => ({
    enviarEmail: jest.fn().mockResolvedValue(undefined),
})

describe('quando o pagamento falha', () => {

    it('retorna null', async () => {
        // Arrange
        const carrinho = new CarrinhoBuilder().build()
        const gatewayStub = criarGatewayStub(false)
        const repositoryDummy = {}
        const emailDummy = {}
        const checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailDummy)

        // Act
        const pedido = await checkoutService.processarPedido(carrinho, CARTAO)

        // Assert
        expect(pedido).toBeNull()
    })

    it('não salva o pedido', async () => {
        // Arrange
        const carrinho = new CarrinhoBuilder().build()
        const gatewayStub = criarGatewayStub(false)
        const repositoryMock = { salvar: jest.fn() }
        const emailDummy = {}
        const checkoutService = new CheckoutService(gatewayStub, repositoryMock, emailDummy)

        // Act
        await checkoutService.processarPedido(carrinho, CARTAO)

        // Assert
        expect(repositoryMock.salvar).not.toHaveBeenCalled()
    })

    it('não envia e-mail', async () => {
        // Arrange
        const carrinho = new CarrinhoBuilder().build()
        const gatewayStub = criarGatewayStub(false)
        const repositoryDummy = {}
        const emailMock = criarEmailMock()
        const checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailMock)

        // Act
        await checkoutService.processarPedido(carrinho, CARTAO)

        // Assert
        expect(emailMock.enviarEmail).not.toHaveBeenCalled()
    })
})

describe('quando um cliente padrão finaliza a compra', () => {
    it('retorna o pedido salvo com o total sem desconto', async () => {
        // Arrange
        const carrinho = new CarrinhoBuilder()
            .comUser(UserMother.umUsuarioPadrao())
            .comItens([new Item('Teclado', 120), new Item('Mouse', 80)])
            .build()

        const gatewayStub = criarGatewayStub(true)
        const repositoryStub = criarRepositoryStub(carrinho, 200)
        const emailDummy = criarEmailMock()
        const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailDummy)

        // Act
        const pedido = await checkoutService.processarPedido(carrinho, CARTAO)

        // Assert
        expect(pedido.totalFinal).toBe(200)
    })

    it('cobra o valor integral no gateway', async () => {
        // Arrange
        const carrinho = new CarrinhoBuilder()
            .comUser(UserMother.umUsuarioPadrao())
            .comItens([new Item('Teclado', 120), new Item('Mouse', 80)])
            .build()

        const gatewayMock = criarGatewayStub(true)
        const repositoryStub = criarRepositoryStub(carrinho, 200)
        const emailDummy = criarEmailMock()
        const checkoutService = new CheckoutService(gatewayMock, repositoryStub, emailDummy)

        // Act
        await checkoutService.processarPedido(carrinho, CARTAO)

        // Assert
        expect(gatewayMock.cobrar).toHaveBeenCalledWith(200, CARTAO)
    })
})

describe('quando um cliente Premium finaliza a compra', () => {
    const prepararCompraPremium = () => {
        const carrinho = new CarrinhoBuilder()
            .comUser(UserMother.umUsuarioPremium())
            .comItens([new Item('Teclado', 120), new Item('Mouse', 80)])
            .build()

        const gatewayStub = criarGatewayStub(true)
        const repositoryStub = criarRepositoryStub(carrinho, 180)
        const emailMock = criarEmailMock()
        const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock)

        return { carrinho, gatewayStub, emailMock, checkoutService }
    }

    it('cobra o valor com 10% de desconto no gateway', async () => {
        // Arrange
        const { carrinho, gatewayStub, checkoutService } = prepararCompraPremium()

        // Act
        await checkoutService.processarPedido(carrinho, CARTAO)

        // Assert
        expect(gatewayStub.cobrar).toHaveBeenCalledWith(180, CARTAO)
    })

    it('envia exatamente um e-mail', async () => {
        // Arrange
        const { carrinho, emailMock, checkoutService } = prepararCompraPremium()

        // Act
        await checkoutService.processarPedido(carrinho, CARTAO)

        // Assert
        expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1)
    })

    it('envia o e-mail de aprovação para o cliente com o valor final', async () => {
        // Arrange
        const { carrinho, emailMock, checkoutService } = prepararCompraPremium()

        // Act
        await checkoutService.processarPedido(carrinho, CARTAO)

        // Assert
        expect(emailMock.enviarEmail).toHaveBeenCalledWith(
            'premium@email.com',
            'Seu Pedido foi Aprovado!',
            'Pedido 1 no valor de R$180',
        )
    })

})