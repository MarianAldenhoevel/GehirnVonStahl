import ast
import logging
import astpretty
import __main__

class GvSError(Exception):
    
    def __init__(self, message):
        super().__init__(message)


class Command:
    
    def __init__(self, command, operand = None):
        self.command = command
        self.operand = operand


class Machine:

    def __init__(self):
        self.logger = logging.getLogger('Maschine')
        
        # Registers:
        self.E = 0
        self.U = 0
        self.R = 0
        self.S = 1
        
        # Code:
        self.History = []

    def __Command(self, command, operand=None):
        self.History.append(Command(command, operand))

    def List(self):
        for c in self.History:
            if c.operand:
                print(c.command + ' ' + str(c.operand))
            else:
                print(c.command)

    def Comment(self, message):
        self.History.append(Command('; ' + message))

    def DONE(self):
        self.__Command('DONE')
        self.Comment('Final result R={R}'.format(R = self.R))
        
    def LOAD(self, n):
        self.__Command('LOAD', n)        
        self.E = n

    def CRANKFWD(self, repeat = 1):
        self.__Command('CRANKFWD {repeat}'.format(repeat = repeat))
        self.R = self.R + repeat * (self.S * self.E)
        self.U = self.U + repeat * self.S

    def CRANKREV(self, repeat = 1):
        self.__Command('CRANKREV {repeat}'.format(repeat = repeat))
        self.R = self.R - repeat * self.S * self.E
        self.U = self.U - repeat * self.S * 1

    def RESETALL(self):
        self.__Command('RESETALL')
        self.E = 0
        self.U = 0
        self.R = 0
        self.S = 1

    def RESETR(self):
        self.__Command('RESETR')
        self.R = 0

    def RESETU(self):
        self.__Command('RESETU')
        self.U = 0

    def SCALEUP(self, repeat = 1):
        self.__Command('SCALEUP {n}'.format(n = repeat))
        self.S = self.S * 10**repeat

    def SCALEDWN(self, repeat = 1):
        self.__Command('SCALEDWN {n}'.format(n = repeat))
        self.S = int(self.S / 10**repeat)

# Set up a logger each for a file in the output folder and the console.      
def setup_logging():
  
  log_level_int = getattr(logging, 'DEBUG')

  fh = logging.FileHandler(__main__.__file__ + '.log')
  fh.setLevel(log_level_int)

  ch = logging.StreamHandler()
  ch.setLevel(log_level_int)

  ch.setFormatter(logging.Formatter('({thread}) [{levelname:7}] {name} - {message}', style='{'))
  fh.setFormatter(logging.Formatter('{asctime} ({thread}) [{levelname:7}] {name} - {message}', style='{'))

  root = logging.getLogger()
  root.addHandler(ch)
  root.addHandler(fh)
  root.setLevel(logging.DEBUG)

def parse_expression(input):
    logger = logging.getLogger('parse_expression')
    logger.debug('parse_expression(\'{input}\')'.format(input = input))

    # Parse the input into an abstract syntax tree using the phython ast module.
    module = ast.parse(input) 
    logger.debug('Input parsed as:\n{ast}'.format(ast = astpretty.pformat(module, indent='  ', show_offsets=False)))
    
    # The grammar used wraps the code in modules and a body array. In the context
    # of this toy we can only process single expressions so we unwrap that and
    # give up if it does not contain what we expect.
    if not isinstance(module, ast.Module):
        raise GvSError('Input does not parse as ast.Module')
    
    if len(module.body) < 1:
        raise GvSError('Module body is empty')
    
    if len(module.body) > 1:
        raise GvSError('Multiple module bodies')
    
    if not isinstance(module.body[0], ast.Expr):
        raise GvSError('Input does not parse as expression')
    
    expr = module.body[0].value

    # Expr now is the AST for a single expression. We will attempt
    # to create code for the target machine from it. If the expression
    # uses anything beyond the simplest of operators and operands that
    # will fail and we give up.  
    logger.debug('Expression extracted as:\n{ast}'.format(ast = astpretty.pformat(expr, indent='  ', show_offsets=False)))
    
    return expr

def check_operand(expr):

    if expr.n.__class__.__name__ != 'int':
        raise GvSError('\'{n}\' is a {classname}. I am a fixed-point machine. Please give me integers only, I deal with the value, you with the scale.' .format(n = expr.n, classname = expr.n.__class__.__name__))
    else:
        if expr.n < 0:
            # Will not happen, -n parses as a UnaryOp.
            raise GvSError('\'{n}\'? No negative inputs please.' .format(n = expr.n))    
        return expr.n

def generate_code_BinOp_Add(machine, expr):
    #logger = logging.getLogger('generate_code_BinOp_Add')
    #logger.debug('generate_code_BinOp_Add()')

    machine.Comment('Begin Add')

    # Addition is commutative. If any of the operands needs
    # to be computed it is preferable to do that first because
    # after that computation the result will be in the Resultwerk
    # and can be reused directly in place. So in that case
    # swap the operands.
    first = expr.left
    second = expr.right

    if isinstance(first, ast.Num) and not isinstance(second, ast.Num):
        first, second = second, first

    # Does the first operand require computation?
    if not isinstance(first, ast.Num):
        # Yes. Emit code to do it. The result will be end up in R.
        generate_code(machine, first)
        
        # Does the other operand require computation?
        if not isinstance(second, ast.Num):
            # Yes, we need to compute the second op 
            
            # Emit code to compute the second.
            machine.generate_code(machine, second)
            
            # Now the value of the second operand is in the R-Register.
        else:
            # No. We have an immediate value for the second operand.
            # Leave the first operand in the R-Register, set the
            # second from the immediate value in the E-Register
            machine.LOAD(check_operand(second))        
    else:
        # No. The first operand is an immediate value. The swap above 
        # implies that the second is as well. So we can simply load the
        # first, set the second and are set up.
        if machine.R:
            machine.RESETR()
        machine.LOAD(check_operand(first))
        machine.CRANKFWD()
        machine.LOAD(check_operand(second))
    
    # Do the actual addition
    machine.CRANKFWD()

    machine.Comment('End Add R={R}'.format(R = machine.R))
        
def generate_code_BinOp_Sub(machine, expr):
    #logger = logging.getLogger('generate_code_BinOp_Sub')
    #logger.debug('generate_code_BinOp_Sub()')

    machine.Comment('Begin Sub')

    # Does the second operand require computation?
    if not isinstance(expr.right, ast.Num):
        # Yes. Emit code to do it. The result will be end up in R.
        generate_code(machine, expr.right)
        second = machine.R
    else:
        second = check_operand(expr.right)
        
    # Does the first operand require computation?
    if not isinstance(expr.left, ast.Num):
        # Yes, we need to compute the first op. Emit code to do that.
        generate_code(machine, expr.left)
            
        # Now the value of the first operand is in the R-Register.
    else:
        # No. We have an immediate value for the first operand. Put that
        # into the R-Register
        machine.RESETR()
        machine.LOAD(check_operand(expr.left))
        machine.CRANKFWD()        
    
    # Load the second operand into E.
    machine.LOAD(second)
    
    # Do the actual subtraction
    machine.CRANKREV()

    machine.Comment('End Sub R={R}'.format(R = machine.R))

def generate_code_BinOp_Mult(machine, expr):
    #logger = logging.getLogger('generate_code_BinOp_Mult')
    #logger.debug('generate_code_BinOp_Mult()')

    machine.Comment('Begin Mult')
    
    # For Multiplication we want to start with one operand in
    # the E-Register and 0 in the R-Register. The second operand
    # we need to have seen to be able to subsequently turn it 
    # into the U-Register. So if any of the operands requires
    # calculation it is preferable to do that first, since we
    # need to reset the R-Register anyway.
    first = expr.left
    second = expr.right

    if isinstance(first, ast.Num) and not isinstance(second, ast.Num):
        first, second = second, first
        
    # Does the first operand require computation?
    if not isinstance(first, ast.Num):
        # Yes. Emit code to do it. The result will be end up in R.
        generate_code(machine, first)

        # Store the value of that to later be turned into the U-Register
        left = machine.R

        # Does the other operand require computation?
        if not isinstance(second, ast.Num):
            # Yes, we need to compute the second op 
            
            generate_code(machine, second)
            # Now the value of the second operand is in the R-Register.
            right = machine.R
        else:
            # No. We have an immediate value for the second operand.
            right = check_operand(second)
    else:
        # No. The first operand is an immediate value. The swap above 
        # implies that the second is as well. So we can simply load the
        left = check_operand(first)
        right = check_operand(second)

    # Set up the multiplication. First think of which is more work, we want the one which
    # requires more turns in E and the other as U target.
    leftdigitsum = sum(int(digit) for digit in str(left))
    rightdigitsum = sum(int(digit) for digit in str(right))
    
    if rightdigitsum > leftdigitsum:
        left, right = right, left

    machine.LOAD(left)
    if machine.R:
        machine.RESETR()
    if machine.U:
        machine.RESETU()
    
    machine.Comment('Do Mult {left}*{right}'.format(left = left, right = right))

    # For each figure of the right operand, in reverse
    s = 0
    i = 0
    for c in reversed(str(right)):
        # if not first figure scale up.
        i += 1
        if i > 1:
            machine.SCALEUP()
            s+=1

        # Crank forward according to the value of the figure
        fig = int(c)
        machine.CRANKFWD(fig)
    
    # Reset scale
    for _ in range(s):
        machine.SCALEDWN()

    machine.Comment('End Mult R={R}'.format(R = machine.R))
        
def generate_code_BinOp_Div(machine, expr):
    #logger = logging.getLogger('generate_code_BinOp_Div')
    #logger.debug('generate_code_BinOp_Div()')

    machine.Comment('Begin Div')
    
    # For Division we want to start with the dividend in
    # the R-Register and the divisor in the E-Register.
        
    # Does the divisor require computation?
    if not isinstance(expr.right, ast.Num):
        # Yes. Emit code to do it. The result will be end up in R.
        generate_code(machine, expr.right)

        # Store the value of that to later be set into the E-Register.
        divisor = machine.R
    else:
        # No. The divisor is an immediate value. Just memorize to
        # later load into E-Register.
        divisor = check_operand(expr.right)

    # Does the dividend require computation?
    if not isinstance(expr.left, ast.Num):
        # Yes. Emit code to do it. The result will be end up in R.
        generate_code(machine, expr.left)

        dividend = machine.R
    else:
        # No. The divisor is an immediate value. Load into E-Register.
        dividend = check_operand(expr.left)

    machine.Comment('Do Div {dividend}/{divisor}'.format(dividend = dividend, divisor = divisor))
    
    # We have divisor and dividend. We need to put the dividend into the
    # R-Registers scaled up.
    machine.RESETR()
    machine.SCALEUP(8)
    machine.LOAD(dividend)
    machine.CRANKFWD()
    machine.Comment('R = {R}'.format(R = machine.R))

    # Scale divisor to align with the dividend and load into E-Register
    while len(str(divisor)) < len(str(dividend)):
        divisor = 10 * divisor
    
    machine.LOAD(divisor)

    if machine.U:
        machine.RESETU()

    while True:
        # Subtract scaled divisor until zero or negative
        while machine.R > 0:
            machine.CRANKREV()
        
        if machine.R < 0:
            # One turn to many, the bell has sounded. Crank back.
            machine.Comment('Ding!')
            machine.CRANKFWD()

        if machine.R == 0:
            # Done.
            machine.Comment('Clean zero!')
            break

        if machine.S == 1:
            # Sled in 1-position. No point in going on.
            machine.Comment('Out of decimal places!')
            break

        # Move sled right one position
        machine.SCALEDWN()

    machine.Comment('U={U}'.format(U = machine.U))
    
    # Move Scale to home position
    while machine.S > 1:
        machine.SCALEDWN()

    # The result is in U, but scaled and negative. To be composable we
    # want it in R. A human operator would just copy it off. So we do
    # the same. The scaling issue we take care of by chopping of trailing
    # zeroes. We are happy to have the human figure out where the decimal
    # point has to go.
    res = -int(str(machine.U).rstrip('0'))
    machine.LOAD(res)
    machine.RESETR()
    machine.CRANKFWD()

    machine.Comment('End Div R={R}'.format(R = machine.R))
    
def generate_code_BinOp(machine, expr):
    #logger = logging.getLogger('generate_code_BinOp')
    #logger.debug('generate_code_BinOp()')

    # We have an operation with two operands to make. Both may
    # be immediately available values (constants) or need a
    # calculation to get them. If we need to calculate them, the
    # result will be in the Resultwerk-Register R.
    #
    # For each of the operations and each combination of immediate
    # vs complex there is a preferred way of doing them that
    # minimizes the need for transfer of values between registers
    # or the stack (i.e. to write down intermediate values).
    
    if isinstance(expr.op, ast.Add):
        generate_code_BinOp_Add(machine, expr) 
    elif isinstance(expr.op, ast.Sub):
        generate_code_BinOp_Sub(machine, expr) 
    elif isinstance(expr.op, ast.Mult):
        generate_code_BinOp_Mult(machine, expr) 
    elif isinstance(expr.op, ast.Div):
        generate_code_BinOp_Div(machine, expr)         
    else:
        raise GvSError('Don\'t know how to process a \'{classname}\' with op \'{op}\''.format(classname=expr.__class__.__name__), op=expr.op.__class__.__name__)

def generate_code_Num(machine, expr):
    #logger = logging.getLogger('generate_code_Num')
    #logger.debug('generate_code_Num()')

    # Put an immediate value into the accumulator:
    if machine.R:
        machine.RESETR()
    machine.LOAD(check_operand(expr))
    machine.CRANKFWD()

def generate_code(machine, expr):
    #logger = logging.getLogger('generate_code')
    #logger.debug('generate_code()')

    if  isinstance(expr, ast.Num):
        generate_code_Num(machine, expr)
    elif  isinstance(expr, ast.BinOp):
        generate_code_BinOp(machine, expr)
    else:
        raise GvSError('Don\'t know how to process a \'{classname}\''.format(classname=expr.__class__.__name__))

def GvS(input):
    logger = logging.getLogger('GvS')
    logger.debug('GvS(\'{input}\')'.format(input = input))

    machine = Machine()
    machine.Comment(input)
    
    expr = parse_expression(input)

    # Expr now is the AST for a single expression. We will attempt
    # to create code for the target machine from it. If the expression
    # uses anything beyond the simplest of operators and operands that
    # will fail and we give up.  
    logger.debug('generate_code()')
    generate_code(machine, expr)

    machine.DONE()

    machine.List()

    # Test against eval(). Yes, eval(). If we at all get here we have successfully computed
    # a value on the Brunsviga. I think this constitutes the ultimate in input-sanitizing.
    evalresult = int(str(eval(input)).replace('.', '').lstrip('0')[:8])
    if evalresult == machine.R:
        logger.info('Machine R={R}, eval()={ev} -> {evalresult}. Yay :-)'.format(R = machine.R, evalresult = evalresult, ev = eval(input)))
    else:
        logger.error('Machine R={R}, eval()={ev} -> {evalresult}. Ouch :-('.format(R = machine.R, evalresult = evalresult, ev = eval(input)))

def main():
    setup_logging()

    logger = logging.getLogger('main')
    logger.info('Starting')

    #GvS('1 + 2') # Simple Addition
    #GvS('1 + 2 + 3') # Series addition
    
    #GvS('4 - 2') # Simple Subtraction
    #GvS('4 - 1 - 1') # Series subtraction
    
    GvS('2 * 3') # Simple multiplication
    
    #GvS('12 * 13') # Simple multiplication
    #GvS('12 * 13 * 14') # Series multiplication

    #GvS('156 / 12') # Simple division
    #GvS('645372 / 2758') # Simple division
    #GvS('1 / 3') # Simple division 
    #GvS('22 / 7') # Approximation of pi 

    #GvS('9 - 8 + 7 - 6') # Mixed addition and subtraction
    #GvS('1 + 2 * 3') # Combination w/o explicit order of operations
    #GvS('(12 + 45) * 607') # Combination /w explicit order of operations
    #GvS('(10 - 2) * (30 + 4)') # Another combination
    
    # Tests for error-conditions
    #GvS('') # No input
    #GvS('-2 + 5') # Valid expression, negative number is out of scope
    #GvS('"a" + "b"') # Valid expression, but out of GvS's scope
    #GvS('2.3*1.4') # Valid expression, but out of GvS's scope
    #GvS('sin(0)')
    
main()