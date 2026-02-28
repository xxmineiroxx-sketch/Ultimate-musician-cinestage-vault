import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import { addOrUpdateService, getPeople, getServices } from '../data/storage';
import { makeId } from '../data/models';

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getMonthMatrix = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  return { year, month, cells };
};

const formatDate = (year, month, day) => {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${mm}/${dd}/${year}`;
};

export default function PlanningScreen({ navigation }) {
  const [services, setServices] = useState([]);
  const [activeServiceId, setActiveServiceId] = useState(null);
  const [people, setPeople] = useState([]);
  const today = new Date();

  const { year, month, cells } = useMemo(() => getMonthMatrix(today), [today]);

  const loadServices = async () => {
    const next = await getServices();
    setServices(next);
    setActiveServiceId(next[0]?.id || null);
    const team = await getPeople();
    setPeople(team);
  };

  useEffect(() => {
    loadServices();
  }, []);

  const handleSelectDate = async (day) => {
    if (!day) return;
    const dateLabel = formatDate(year, month, day);
    const newService = await addOrUpdateService({
      id: makeId('svc'),
      date: dateLabel,
      title: `Service ${dateLabel}`,
      setlist: [],
      assignments: [],
      status: 'draft',
    });
    setServices((prev) => [newService, ...prev]);
    setActiveServiceId(newService.id);
  };

  const activeService = services.find((s) => s.id === activeServiceId);

  const assignRole = async (personId, role) => {
    if (!activeService) return;
    const existing = activeService.assignments || [];
    const filtered = existing.filter((a) => a.personId !== personId);
    const nextService = {
      ...activeService,
      assignments: [...filtered, { personId, role }],
    };
    await addOrUpdateService(nextService);
    setServices((prev) =>
      prev.map((s) => (s.id === nextService.id ? nextService : s))
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Planning Center</Text>
      <Text style={styles.caption}>Calendar, service plans, and team scheduling.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Calendar</Text>
        <View style={styles.weekdays}>
          {weekdayLabels.map((d) => (
            <Text key={d} style={styles.weekday}>{d}</Text>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((day, idx) => (
            <TouchableOpacity
              key={`${day || 'x'}-${idx}`}
              style={[styles.cell, day && styles.cellActive]}
              onPress={() => handleSelectDate(day)}
              disabled={!day}
            >
              <Text style={styles.cellText}>{day || ''}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Active Service</Text>
        {activeService ? (
          <>
            <Text style={styles.serviceTitle}>{activeService.title}</Text>
            <Text style={styles.serviceMeta}>{activeService.date}</Text>
            <PrimaryButton
              title="Open Service Plan"
              onPress={() => navigation.navigate('Rehearsal', { serviceId: activeService.id })}
              style={{ marginTop: 10 }}
            />
          </>
        ) : (
          <Text style={styles.caption}>No service active.</Text>
        )}
      </View>

      {activeService && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Team Assignments</Text>
          {people.map((person) => {
            const assigned = (activeService.assignments || []).find((a) => a.personId === person.id);
            return (
              <View key={person.id} style={styles.assignRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceTitle}>{person.name}</Text>
                  <Text style={styles.serviceMeta}>{assigned ? `Assigned: ${assigned.role}` : 'Not assigned'}</Text>
                </View>
                <View style={styles.roleRow}>
                  {(person.roles || []).map((role) => (
                    <TouchableOpacity
                      key={role}
                      style={styles.roleChip}
                      onPress={() => assignRole(person.id, role)}
                    >
                      <Text style={styles.roleText}>{role}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
          {!people.length && <Text style={styles.caption}>Add team members first.</Text>}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sections</Text>
        <Text style={styles.sectionItem}>Calendar</Text>
        <Text style={styles.sectionItem}>Library</Text>
        <Text style={styles.sectionItem}>Service Plan</Text>
        <Text style={styles.sectionItem}>People & Roles</Text>
        <Text style={styles.sectionItem}>Integrations & Settings</Text>
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
    marginBottom: 12,
  },
  cardTitle: {
    color: '#E5E7EB',
    fontWeight: '600',
    marginBottom: 8,
  },
  weekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekday: {
    color: '#9CA3AF',
    fontSize: 11,
    width: '14.2%',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  cell: {
    width: '14.2%',
    paddingVertical: 10,
    alignItems: 'center',
  },
  cellActive: {
    backgroundColor: '#020617',
    borderRadius: 6,
  },
  cellText: {
    color: '#E5E7EB',
    fontSize: 12,
  },
  serviceTitle: {
    color: '#F9FAFB',
    fontWeight: '600',
  },
  serviceMeta: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  sectionItem: {
    color: '#E5E7EB',
    fontSize: 12,
    paddingVertical: 2,
  },
  assignRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  roleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  roleText: {
    color: '#E5E7EB',
    fontSize: 11,
  },
});
