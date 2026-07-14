const Admin = {
  guests: null,
  config: null,
  rsvps: null,

  async init() {
    await API.init();
    const [guestsResp, configResp] = await Promise.all([
      fetch('/data/guests.json'),
      fetch('/data/config.json'),
    ]);
    this.guests = await guestsResp.json();
    this.config = await configResp.json();
    this._setup();
  },

  _setup() {
    document.getElementById('admin-login-form').addEventListener('submit', (e) => this._handleLogin(e));
    if (this._checkSession()) {
      this._showDashboard();
    }
  },

  async _hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  _checkSession() {
    return sessionStorage.getItem('wedding_admin_auth') === 'true';
  },

  async _handleLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById('admin-login-error');
    const password = document.getElementById('admin-password').value;

    const hash = await this._hashPassword(password);
    if (hash === this.config.adminPasswordHash) {
      sessionStorage.setItem('wedding_admin_auth', 'true');
      errorEl.hidden = true;
      this._showDashboard();
    } else {
      errorEl.textContent = 'Incorrect admin password.';
      errorEl.hidden = false;
    }
  },

  async _showDashboard() {
    document.getElementById('admin-login-section').hidden = true;
    document.getElementById('admin-dashboard').hidden = false;
    await this._loadRSVPs();
    this._render();
  },

  async _loadRSVPs() {
    if (API.isLocal()) {
      this.rsvps = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('wedding_rsvp_')) {
          const householdId = parseInt(key.replace('wedding_rsvp_', ''), 10);
          try {
            this.rsvps[householdId] = JSON.parse(localStorage.getItem(key));
          } catch {}
        }
      }
      return;
    }

    this.rsvps = await API.listRSVPs(this.config.sitePassword);
  },

  _mealLabel(value) {
    const opt = this.config.mealOptions.find(m => m.value === value);
    return opt ? opt.label : value;
  },

  _mealOptionsHtml(selected) {
    return this.config.mealOptions.map(o =>
      `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${o.label}</option>`
    ).join('');
  },

  async _saveRSVP(householdId, rsvpData) {
    if (!API.isLocal()) {
      await API.submitRSVP(rsvpData);
    }
    localStorage.setItem(`wedding_rsvp_${householdId}`, JSON.stringify(rsvpData));
    this.rsvps[householdId] = rsvpData;
    this._render();
  },

  _editRow(guest, rsvp, rsvpGuest, rowEl) {
    const cells = rowEl.cells;
    const attending = rsvpGuest ? rsvpGuest.attending : false;
    const meal = rsvpGuest && rsvpGuest.attending ? (rsvpGuest.meal || '') : '';
    const diet = rsvpGuest && rsvpGuest.attending ? (rsvpGuest.dietaryRestrictions || '') : '';

    const attendingCheckbox = document.createElement('input');
    attendingCheckbox.type = 'checkbox';
    attendingCheckbox.checked = attending;
    attendingCheckbox.className = 'admin-edit-checkbox';
    cells[5].innerHTML = '';
    cells[5].appendChild(attendingCheckbox);

    const mealSelect = document.createElement('select');
    mealSelect.className = 'admin-edit-select';
    mealSelect.innerHTML = `<option value="">-- Select Meal --</option>${this._mealOptionsHtml(meal)}`;
    mealSelect.disabled = !attending;
    cells[6].innerHTML = '';
    cells[6].appendChild(mealSelect);

    const dietInput = document.createElement('input');
    dietInput.type = 'text';
    dietInput.className = 'admin-edit-input';
    dietInput.value = diet;
    dietInput.placeholder = 'Dietary restrictions';
    cells[7].innerHTML = '';
    cells[7].appendChild(dietInput);

    attendingCheckbox.addEventListener('change', () => {
      mealSelect.disabled = !attendingCheckbox.checked;
      if (!attendingCheckbox.checked) mealSelect.value = '';
    });

    const actionCell = cells[8];
    actionCell.innerHTML = '';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-sm btn-sm-save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      const newAttending = attendingCheckbox.checked;
      const newMeal = newAttending ? mealSelect.value : '';

      if (newAttending && !newMeal) {
        alert('Please select a meal for this guest.');
        return;
      }

      const hId = guest.householdId;
      let rsvpData = this.rsvps[hId];
      if (!rsvpData) {
        rsvpData = {
          householdId: hId,
          guests: [],
          submittedAt: new Date().toISOString(),
        };
      }

      const existing = rsvpData.guests.findIndex(g => g.guestId === guest.id);
      const guestEntry = {
        guestId: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        ageGroup: guest.ageGroup,
        attending: newAttending,
        meal: newMeal,
        dietaryRestrictions: dietInput.value.trim(),
      };

      if (existing >= 0) {
        rsvpData.guests[existing] = guestEntry;
      } else {
        rsvpData.guests.push(guestEntry);
      }

      rsvpData.submittedAt = new Date().toISOString();
      await this._saveRSVP(hId, rsvpData);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-sm btn-sm-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this._render());

    actionCell.appendChild(saveBtn);
    actionCell.appendChild(cancelBtn);
  },

  _render() {
    const households = {};
    for (const guest of this.guests) {
      if (!households[guest.householdId]) {
        households[guest.householdId] = [];
      }
      households[guest.householdId].push(guest);
    }

    const householdIds = Object.keys(households).map(Number).sort((a, b) => a - b);

    let totalGuests = 0;
    let totalAttending = 0;
    let totalRsvped = 0;
    const mealCounts = {};

    const tbody = document.getElementById('admin-table-body');
    tbody.innerHTML = '';

    for (const hId of householdIds) {
      const guests = households[hId];
      const rsvp = this.rsvps[hId];
      const rsvped = !!rsvp;
      if (rsvped) totalRsvped++;

      const lastName = guests[0].lastName || '(no last name)';

      for (const guest of guests) {
        totalGuests++;
        const rsvpGuest = rsvp ? rsvp.guests.find(g => g.guestId === guest.id) : null;
        const responded = !!rsvpGuest;
        const attending = rsvpGuest ? rsvpGuest.attending : false;
        const meal = rsvpGuest && rsvpGuest.attending ? rsvpGuest.meal : '';
        const diet = rsvpGuest && rsvpGuest.attending ? (rsvpGuest.dietaryRestrictions || '') : '';

        if (attending) {
          totalAttending++;
          if (meal) {
            mealCounts[meal] = (mealCounts[meal] || 0) + 1;
          }
        }

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${hId}</td>
          <td>${rsvped ? 'Yes' : 'No'}</td>
          <td>${lastName}</td>
          <td>${guest.firstName}</td>
          <td><span class="age-badge ${guest.ageGroup}">${guest.ageGroup === 'adult' ? 'Adult' : 'Child'}</span></td>
          <td class="cell-attending ${responded ? (attending ? 'status-yes' : 'status-no') : 'status-none'}">${responded ? (attending ? 'Yes' : 'No') : 'Not Responded'}</td>
          <td class="cell-meal">${meal ? this._mealLabel(meal) : '-'}</td>
          <td>${diet || '-'}</td>
          <td></td>
        `;
        tbody.appendChild(row);

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-sm btn-sm-edit';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => this._editRow(guest, rsvp, rsvpGuest, row));
        row.cells[8].appendChild(editBtn);
      }
    }

    document.getElementById('stat-total-guests').textContent = totalGuests;
    document.getElementById('stat-total-households').textContent = householdIds.length;
    document.getElementById('stat-rsvped').textContent = totalRsvped;
    document.getElementById('stat-not-rsvped').textContent = householdIds.length - totalRsvped;
    document.getElementById('stat-attending').textContent = totalAttending;
    document.getElementById('stat-not-attending').textContent = totalGuests - totalAttending;

    const mealList = document.getElementById('meal-breakdown');
    mealList.innerHTML = '';
    for (const opt of this.config.mealOptions) {
      const count = mealCounts[opt.value] || 0;
      const li = document.createElement('li');
      li.textContent = `${opt.label}: ${count}`;
      mealList.appendChild(li);
    }

    document.getElementById('admin-logout-btn').addEventListener('click', () => {
      sessionStorage.removeItem('wedding_admin_auth');
      document.getElementById('admin-dashboard').hidden = true;
      document.getElementById('admin-login-section').hidden = false;
      document.getElementById('admin-password').value = '';
    });
  },
};
