import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import Chip from '../components/Chip';
import { addOrUpdatePerson, deletePerson, getPeople } from '../data/storage';
import { makeId, ROLE_OPTIONS } from '../data/models';

export default function PeopleRolesScreen() {
  const [people, setPeople] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roles, setRoles] = useState([]);

  const load = async () => {
    const next = await getPeople();
    setPeople(next);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleRole = (role) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    const next = await addOrUpdatePerson({
      id: makeId('person'),
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      roles,
    });
    setPeople((prev) => [next, ...prev]);
    setName('');
    setEmail('');
    setPhone('');
    setRoles([]);
  };

  const handleDelete = async (personId) => {
    const next = await deletePerson(personId);
    setPeople(next);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>People & Roles</Text>
      <Text style={styles.caption}>Add team members and assign roles.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add Team Member</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor="#6B7280"
        />
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#6B7280"
        />
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone"
          placeholderTextColor="#6B7280"
        />

        <Text style={styles.sectionTitle}>Roles</Text>
        <View style={styles.chipRow}>
          {ROLE_OPTIONS.map((role) => (
            <Chip
              key={role}
              label={role}
              selected={roles.includes(role)}
              onPress={() => toggleRole(role)}
            />
          ))}
        </View>
        <PrimaryButton title="Add Team Member" onPress={handleAdd} />
      </View>

      <View style={styles.list}>
        {people.map((person) => (
          <View key={person.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{person.name}</Text>
              <Text style={styles.personMeta}>{person.email || person.phone || ''}</Text>
              <Text style={styles.rolesText}>{(person.roles || []).join(', ') || 'No roles'}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(person.id)}>
              <Text style={styles.delete}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#020617',
  },
  heading: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  caption: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#0B1120',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#111827',
  },
  cardTitle: {
    color: '#E5E7EB',
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#020617',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#E5E7EB',
    fontSize: 13,
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 6,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  list: {
    marginTop: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  personName: {
    color: '#F9FAFB',
    fontWeight: '600',
  },
  personMeta: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  rolesText: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 4,
  },
  delete: {
    color: '#F87171',
    fontSize: 12,
    paddingHorizontal: 8,
  },
});
