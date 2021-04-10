class Machine {

	constructor() {
		this.E = 0;
        this.U = 0;
        this.R = 0;
        this.S = 1;
		
		// Code:
        this.History = [];
	}
	
    command(cmd, operand) {
		var c = {
			'command': cmd, 
			'operand': operand
		};
		
		// console.log(c);
		
        this.History.push(c);
	}

    list() {
        for(c in this.History) {
            if (c.operand) {
                console.log(c.command + ' ' + str(c.operand))
            } else {
                console.log(c.command);
			}
		}
	}

    comment(message) {
		this.command('; ' + message);
	}
	
    DONE() {
        this.command('DONE');
        this.comment('Final result R=' + this.R);
    }
	
    LOAD(n) {
        this.command('LOAD', n);        
        this.E = n;
	}

    CRANKFWD(repeat) {
        this.command('CRANKFWD ' + repeat);
        this.R = this.R + repeat * (this.S * this.E);
        this.U = this.U + repeat * this.S;
	}

    CRANKREV(repeat) {
        this.command('CRANKREV ' + repeat)
        this.R = this.R - repeat * this.S * this.E
        this.U = this.U - repeat * this.S * 1
	}
	
    RESETALL() {
        this.command('RESETALL');
        this.E = 0;
        this.U = 0;
        this.R = 0;
        this.S = 1;
	}

    RESETR() {
        this.command('RESETR');
        this.R = 0;
	}

    RESETU() {
        this.command('RESETU');
        this.U = 0;
	}

    SCALEUP(repeat = 1) {
        this.command('SCALEUP ' + repeat);
        this.S = this.S * 10**repeat;
	}

    SCALEDWN(repeat = 1) {
        this.command('SCALEDWN ' + repeat);
        this.S = Math.trunc(this.S / 10**repeat);
	}
	
	check_operand(node) {
		// node should represent an integer to pass
		if (node.isConstantNode && node.value && (typeof node.value === 'number')) {
			// it's there and it's a number.
			if (node.value % 1 === 0) {
				// it's an integer
				if (node.value<0) {
				throw ('\'' + node.value + '\'? No negative inputs please.');
				}
			} else {
				throw ('\'' + node.value + '\'? I am a fixed-point machine. Please give me integers only, I deal with the value, you with the scale.');
			}
		}
		
		return node.value;
	}
	
	generate_code_BinOp_Add(node) {
		this.comment('Begin Add')

		/*
			Addition is commutative. If any of the operands needs
			to be computed it is preferable to do that first because
			after that computation the result will be in the Resultwerk
			and can be reused directly in place. So in that case
			swap the operands.
		*/
		var first =  node.args[0];
		var second = node.args[1];

		if (first.isConstantNode && !second.isConstantNode) {
			// swap:
			first =  node.args[1];
			second = node.args[0];
		}
	
		// Does the first operand require computation?
		if (!first.isConstantNode) {
			// Yes. Emit code to do it. The result will be end up in R.
			this.generate_code(first)
			
			// Does the other operand require computation?
			if (!second.isConstantNode) {
				// Yes, we need to compute the second op 
				
				// Emit code to compute the second.
				this.generate_code(second)
				
				// Now the value of the second operand is in the R-Register.
			} else {
				/*
					No. We have an immediate value for the second operand.
					Leave the first operand in the R-Register, set the
					second from the immediate value in the E-Register
				*/
				this.LOAD(this.check_operand(second));
			}				
		} else {
			/*
				No. The first operand is an immediate value. The swap above 
				implies that the second is as well. So we can simply load the
				first, set the second and are set up.
			*/
			if (this.R) {
				this.RESETR();
			}
			this.LOAD(this.check_operand(first));
			this.CRANKFWD(1);
			this.LOAD(this.check_operand(second));
		}
		
		// Do the actual addition
		this.CRANKFWD(1)

		this.comment('End Add R=' + this.R);
	}
	
	generate_code_BinOp_Sub(node) {
		this.comment('Begin Sub')

		var second;

		// Does the second operand require computation?
		if (!node.args[1].isConstant) {
			// Yes. Emit code to do it. The result will be end up in R.
			this.generate_code(node.args[1])
			second = this.R;
		} else {
			second = this.check_operand(node.args[1]);
		}
			
		// Does the first operand require computation?
		if (!node.args[0].isConstant) {
			// Yes, we need to compute the first op. Emit code to do that.
			this.generate_code(node.args[0]);
				
			// Now the value of the first operand is in the R-Register.
		} else {
			// No. We have an immediate value for the first operand. Put that
			// into the R-Register
			this.RESETR();
			this.LOAD(this.check_operand(node.args[0]));
			this.CRANKFWD(1);        
		}
		
		// Load the second operand into E.
		this.LOAD(second);
		
		// Do the actual subtraction
		this.CRANKREV(1);

		this.comment('End Sub R=' + this.R);
	}

	generate_code_BinOp_Mult(node) {
		this.comment('Begin Mult')
		
		/*
			For Multiplication we want to start with one operand in
			the E-Register and 0 in the R-Register. The second operand
			we need to have seen to be able to subsequently turn it 
			into the U-Register. So if any of the operands requires
			calculation it is preferable to do that first, since we
			need to reset the R-Register anyway.
		*/
		var first =  node.args[0];
		var second = node.args[1];

		if (first.isConstantNode && !second.isConstantNode) {
			// swap:
			first =  node.args[1];
			second = node.args[0];
		}
	
		var left;
		var right;
		
		// Does the first operand require computation?
		if (!first.isConstant) {
			//  Yes. Emit code to do it. The result will be end up in R.
			this.generate_code(first);

			// Store the value of that to later be turned into the U-Register
			left = this.R;

			// Does the other operand require computation?
			if (!second.isConstant) {
				// Yes, we need to compute the second op 
				
				this.generate_code(second)
				// Now the value of the second operand is in the R-Register.
				right = this.R;
			} else {
				// No. We have an immediate value for the second operand.
				right = this.check_operand(second)
			}
		} else {
			// No. The first operand is an immediate value. The swap above 
			// implies that the second is as well. So we can simply load them.
			left = this.check_operand(first)
			right = this.check_operand(second)
		}
		
		// Set up the multiplication. First think of which is more work, we want the one which
		// requires more turns in E and the other as U target.
		var digitsum = function(n) {
			var sum = 0;
			while (n) {
				var digit = n % 10;
				sum += digit;
				n = (n - digit) / 10;
			}
			return sum;
		}
		
		var leftdigitsum = digitsum(left);
		var rightdigitsum = digitsum(right);
		
		if (rightdigitsum > leftdigitsum) {
			var t = left;
			left = right;
			right = t;
		}
		
		this.LOAD(left);
		
		if (this.R) {
			this.RESETR();
		}
		
		if (this.U) {
			this.RESETU();
		}
		
		this.comment('Do Mult ' + left + '*' +  right);

		// For each figure of the right operand, in reverse
		var s = 0
		var i = 0
		var digits = right.toString().split('').reverse();
		
		for(var c of digits) {
			// if not first figure scale up.
			i += 1
			if (i > 1) {
				this.SCALEUP(1);
				s+=1;
			}

			// Crank forward according to the value of the figure
			this.CRANKFWD(c);
		}
		
		// Reset scale
		this.SCALEDWN(s);

		this.comment('End Mult R=' + this.R);
	}

	generate_code_BinOp_Div(node) {
		this.comment('Begin Div')
		
		/*
			For Division we want to start with the dividend in
			the R-Register and the divisor in the E-Register.
		*/
		var dividend;
		var divisor;
		
		// Does the divisor require computation?
		if (!node.args[1].isConstant) {
			// Yes. Emit code to do it. The result will be end up in R.
			this.generate_code(node.args[1]);

			// Store the value of that to later be set into the E-Register.
			divisor = this.R;
		} else {
			// No. The divisor is an immediate value. Just memorize to
			// later load into E-Register.
			divisor = this.check_operand(node.args[1]);
		}
		
		// Does the dividend require computation?
		if (node.args[0].isConstant) {
			// Yes. Emit code to do it. The result will be end up in R.
			this.generate_code(node.args[0]);

			dividend = this.R;
		} else {
			// No. The divisor is an immediate value. Load into E-Register.
			dividend = this.check_operand(node.args[0]);
		}
		
		this.comment('Do Div ' + dividend + '/' + divisor);
		
		// We have divisor and dividend. We need to put the dividend into the
		// R-Register scaled up.
		this.RESETR();
		this.SCALEUP(8);
		this.LOAD(dividend);
		this.CRANKFWD(1);
		this.comment('R = ' + this.R);

		// Scale divisor to align with the dividend and load into E-Register
		while (divisor.toString().length < dividend.toString().length) {
			divisor = 10 * divisor;
		}
		
		this.LOAD(divisor);

		if (this.U) {
			this.RESETU();
		}
		
		while (true) {
			// Subtract scaled divisor until zero or negative
			while (this.R > 0) {
				this.CRANKREV(1);
			}
			
			if (this.R < 0) {
				// One turn to many, the bell has sounded. Crank forward to correct the underflow.
				this.comment('Ding!');
				this.CRANKFWD(1);
			}

			if (this.R == 0) {
				// Done.
				this.comment('Clean zero!');
				break;
			}

			if (this.S == 1) {
				// Sled in 1-position. No point in going on.
				this.comment('Out of decimal places!');
				break;
			}

			// Move sled right one position
			this.SCALEDWN(1);
		}
		
		this.comment('U=' + this.U);
		
		// Move Scale to home position
		this.SCALEDWN(Math.log10(this.S));
		
		/* 
			The result is in U, but scaled and negative. To be composable we
			want it in R. A human operator would just copy it off. So we do
			the same. The scaling issue we take care of by chopping of trailing
			zeroes. We are happy to have the human figure out where the decimal
			point has to go.
		*/
		var res = (-this.U).toString();
		while (res.substring(res.length,1) == '0') {
			res = res.substring(0,res.length-1);
		}
		
		this.LOAD(res);
		this.RESETR();
		this.CRANKFWD(1);

		this.comment('End Div R=' + this.R);
	}
	
	generate_code_BinOp(node) {
		/*
		 We have an operation with two operands to make. Both may
		 be immediately available values (constants) or need a
		 calculation to get them. If we need to calculate them, the
		 result will be in the Resultwerk-Register R.
		
		 For each of the operations and each combination of immediate
		 vs complex there is a preferred way of doing them that
		 minimizes the need for transfer of values between registers
		 or the stack (i.e. to write down intermediate values).
		*/
		
		if (node.op == '+') {
			this.generate_code_BinOp_Add(node);
		} else if (node.op == '-') {
			this.generate_code_BinOp_Sub(node);
		} else if (node.op == '*') {
			this.generate_code_BinOp_Mult(node);
		} else if (node.op == '/') {
			this.generate_code_BinOp_Div(node);
		} else {
			throw ('Don\'t know how to process operand \'' + node.op + '\'');
		}
	}

	generate_code_Num(node) {
		// Put an immediate value into the accumulator:
		if (this.R) {
			this.RESETR();
		}
		this.LOAD(this.check_operand(node));
		this.CRANKFWD(1);
	}
	
	generate_code(node) {
		if (node.isConstantNode) {
			this.generate_code_Num(node);
		} else if (node.isParenthesisNode) {
			this.generate_code(node.content);
		} else if (node.isOperatorNode && node.args && (node.args.length==2)) {
			this.generate_code_BinOp(node);
		} else if (node.isOperatorNode && (node.fn=='unaryMinus')) {
			throw 'Stay positive!';
		} else {
			throw 'Don\'t know how to process node \'' +  node.name + '\'';
		}
	}
	
	generate_code_from_str(expression) {
		console.log('generate_code_from_str("' + expression + '")');
		
		const node = math.parse(expression);
		
		console.log(node);
		
		this.generate_code(node);
		this.DONE();
		
		this.comment('Math.js says: ' + node.evaluate().toString());
	}
}
