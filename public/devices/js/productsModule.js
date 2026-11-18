let productsModule = async function(_products) {
    await appendFromTemplate('product-selection');

    const actionBtn = document.getElementById('action-btn');
    const summaryText = document.getElementById('selected-summary');
    const grid = document.getElementById('price-grid');

    let _buttons = [];
    let _currentAmount = "";
    let _currentDesc = "";

    renderButtons();

    actionBtn.addEventListener('click', () => {
        actionBtn.disabled = true;
        _buttons.forEach(btn => btn.disabled = true);
        
        actionBtn.innerText = "Processing Payment ...";

        checkout(_currentAmount, _currentDesc);
    });

    function selectItem(amount, description) {
        summaryText.innerText = `${description}`;
        actionBtn.innerText = `Proceed to Pay €${amount}`;
    }

    async function checkout(amount, description) {
        try {
            if (null === DEVICE_ID) {
                throw new Error("Could not determine the device id from the URL!");
            }
            const targetEndpoint = `/api/v1/devices/${encodeURIComponent(DEVICE_ID)}/checkout`;

            const response = await fetch(targetEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    amount: amount,
                    description: description
                })
            });

            if (201 !== response.status) {
                throw new Error("The new transaction was not created!");
            }

            const data = await response.json();
            if ("redirect_url" in data) {
                window.location.href = data["redirect_url"];
                return;
            }

            throw new Error("No Redirect Url was provided!");
        } catch (error) {
            console.error(error);
            // Let the user retry.
            _buttons.forEach(btn => btn.disabled = false);
            actionBtn.disabled = false;
            selectItem(_currentAmount, _currentDesc);
            actionBtn.innerText = "An error occurred - try again";
        }
    }

    function renderButtons() {
        grid.innerHTML = ''; 

        _products.forEach((product, index) => {
            const button = document.createElement('button');
            button.className = `price-btn ${product.active ? 'active' : ''}`;
            button.setAttribute('data-amount', product.amount);
            button.setAttribute('data-desc', product.desc);
            button.textContent = `€${product.amount}`;
            
            button.addEventListener('click', (e) => {
                _buttons.forEach(btn => btn.classList.remove('active'));
                
                e.target.classList.add('active');
                
                _currentAmount = e.target.getAttribute('data-amount');
                _currentDesc = e.target.getAttribute('data-desc');

                selectItem(_currentAmount, _currentDesc);
            });

            grid.appendChild(button);
            _buttons.push(button);

            if (product.active) {
                _currentAmount = product.amount;
                _currentDesc = product.desc;
                selectItem(_currentAmount, _currentDesc);
            }
        });
    }
};
